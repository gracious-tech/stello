
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {app, BrowserWindow, config_mock, electron_mock, screen, session, shell}
    from '../electron.test_utils'
import store from './store.js'
import {activate_app, open_window} from './window.js'

import type {MockBrowserWindow} from '../electron.test_utils'


vi.mock('electron', () => import('../electron.test_utils'))
vi.mock('./config.js', () => import('../electron.test_utils').then(m => m.config_mock))
vi.mock('./store.js', () => ({default: {state: {version: '1.2.3'}, save: vi.fn()}}))


const original_platform = process.platform


// Reset state between tests
beforeEach(() => {
    vi.clearAllMocks()
    BrowserWindow.instances.length = 0
    store.state = {version: '1.2.3'}
    app.isPackaged = false
    config_mock.TESTING = false
})
afterEach(() => {
    Object.defineProperty(process, 'platform', {value: original_platform})
})


async function open(){
    // Open a window and return it typed as mock
    return await open_window() as unknown as MockBrowserWindow
}


describe('activate_app', () => {

    // Opens a window if none
    test('opens window when none exist', async () => {
        const window = await activate_app() as unknown as MockBrowserWindow
        expect(BrowserWindow.instances).toEqual([window])
    })

    // Restores and shows existing window rather than creating another
    test('restores existing minimized window', async () => {
        const existing = await open()
        existing.minimized = true
        const window = await activate_app()
        expect(window).toBe(existing)
        expect(existing.restore).toHaveBeenCalled()
        expect(existing.show).toHaveBeenCalled()
        expect(BrowserWindow.instances).toHaveLength(1)
    })

    // Doesn't restore if not minimized
    test('shows existing non-minimized window', async () => {
        const existing = await open()
        await activate_app()
        expect(existing.restore).not.toHaveBeenCalled()
        expect(existing.show).toHaveBeenCalled()
    })
})


describe('open_window', () => {

    // Dev mode loads from dev server with devtools
    test('dev loads url and opens devtools', async () => {
        const window = await open()
        expect(window.loadURL).toHaveBeenCalledWith('http://127.0.0.1:8000')
        expect(window.webContents.openDevTools).toHaveBeenCalled()
        expect(window.options['width']).toBe(1200)
        expect(window.options['height']).toBe(800)
        const prefs = window.options['webPreferences'] as Record<string, unknown>
        expect(prefs['session']).toBe(session.defaultSession)
        expect(String(prefs['preload'])).toMatch(/preload\.js$/)
    })

    // Packaged loads local file without devtools
    test('packaged loads file', async () => {
        app.isPackaged = true
        const window = await open()
        expect(window.loadFile).toHaveBeenCalledWith(expect.stringMatching(/app\/index\.html$/))
        expect(window.webContents.openDevTools).not.toHaveBeenCalled()
    })

    // Testing uses a separate session that is cleared
    test('testing uses cleared partition', async () => {
        config_mock.TESTING = true
        const window = await open()
        expect(session.fromPartition).toHaveBeenCalledWith('test')
        expect(electron_mock.test_session.clearStorageData).toHaveBeenCalled()
        expect(window.webContents.openDevTools).not.toHaveBeenCalled()
    })

    // Previous size is restored within limits of monitors and min size
    test('restores window size within bounds', async () => {
        screen.getAllDisplays.mockReturnValue([
            {bounds: {width: 1600, height: 900}},
            {bounds: {width: 2560, height: 1440}},
        ])
        store.state.window_bounds = {x: 0, y: 0, width: 3000, height: 1000}
        store.state.window_maximized = true
        const window = await open()
        expect(window.options['width']).toBe(2560)
        expect(window.options['height']).toBe(1000)
        expect(window.maximize).toHaveBeenCalled()

        // Too small is increased to min
        store.state.window_bounds = {x: 0, y: 0, width: 10, height: 10}
        const small = await open()
        expect([small.options['width'], small.options['height']]).toEqual([1200, 800])
    })

    // Menu bar hidden except on Mac
    test('menu bar hidden on non-mac only', async () => {
        Object.defineProperty(process, 'platform', {value: 'linux'})
        expect((await open()).setMenuBarVisibility).toHaveBeenCalledWith(false)
        Object.defineProperty(process, 'platform', {value: 'darwin'})
        expect((await open()).setMenuBarVisibility).not.toHaveBeenCalled()
    })

    // Window bounds saved on close
    test('saves bounds on close', async () => {
        const window = await open()
        window.maximized = true
        window.emit('close')
        expect(store.state.window_bounds).toEqual({x: 1, y: 2, width: 1300, height: 900})
        expect(store.state.window_maximized).toBe(true)
        expect(store.save).toHaveBeenCalled()
    })
})


describe('navigation', () => {

    // Internal navigation reloads app and external http(s) opens in browser
    test('will-navigate', async () => {
        const window = await open()
        window.loadURL.mockClear()
        const navigate = (url:string) => {
            const event = {preventDefault: vi.fn()}
            window.contents.emit('will-navigate', event, url)
            expect(event.preventDefault).toHaveBeenCalled()
        }
        navigate('http://127.0.0.1:8000#/drafts/')
        expect(window.loadURL).toHaveBeenCalledTimes(1)
        navigate('https://stello.news/')
        expect(shell.openExternal).toHaveBeenCalledWith('https://stello.news/')
        navigate('http://example.com/')
        expect(shell.openExternal).toHaveBeenCalledWith('http://example.com/')
        // SECURITY Other protocols must not be opened
        navigate('file:///etc/passwd')
        navigate('smb://evil/share')
        expect(shell.openExternal).toHaveBeenCalledTimes(2)
        expect(window.loadURL).toHaveBeenCalledTimes(1)
    })

    // New windows are always denied but external links opened in browser
    test('window open handler denies', async () => {
        const window = await open()
        const result = window.window_open_handler!({url: 'https://x.com/'})
        expect(result).toEqual({action: 'deny'})
        expect(shell.openExternal).toHaveBeenCalledWith('https://x.com/')
    })
})


describe('CORS overrides', () => {

    type HeadersCallback = (response:Record<string, unknown>)=>void

    function receive(window:MockBrowserWindow, details:Record<string, unknown>){
        // Simulate headers received and return what callback was given
        const callback = vi.fn<HeadersCallback>()
        window.headers_listener!(details, callback)
        return callback.mock.calls[0]![0]
    }

    // Only applies to specific origins
    test('filter includes hosted api', async () => {
        const window = await open()
        const filter = window.headers_filter as {urls:string[]}
        expect(filter.urls).toContain('https://api.example/*')
        expect(filter.urls).toContain('https://*.amazonaws.com/*')
    })

    // OPTIONS replaced with allow-all success
    test('OPTIONS replaced', async () => {
        const window = await open()
        const response = receive(window, {method: 'OPTIONS', statusLine: 'HTTP/1.1 403 Forbidden',
            responseHeaders: {}})
        expect(response['statusLine']).toBe('HTTP/1.1 200 OK')
        expect(response['responseHeaders']).toEqual({
            'access-control-allow-origin': '*',
            'access-control-allow-methods': '*',
            'access-control-allow-headers': '*',
        })
    })

    // Other responses get CORS headers, replacing clashes regardless of case
    test('response headers merged', async () => {
        const window = await open()
        const response = receive(window, {method: 'GET', statusLine: 'HTTP/1.1 200 OK',
            responseHeaders: {
                'Access-Control-Allow-Origin': ['https://other'],
                'Content-Type': ['text/plain'],
            }})
        expect(response['responseHeaders']).toEqual({
            'Content-Type': ['text/plain'],
            'access-control-allow-origin': ['*'],
            'access-control-expose-headers': ['*'],
        })
    })

    // Missing headers handled
    test('no existing headers', async () => {
        const window = await open()
        const response = receive(window, {method: 'GET', statusLine: 'HTTP/1.1 200 OK'})
        expect(Object.keys(response['responseHeaders'] as object)).toHaveLength(2)
    })
})


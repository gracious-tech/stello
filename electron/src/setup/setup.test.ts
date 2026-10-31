
import {existsSync, mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {app, dialog, electron_mock, Menu} from '../electron.test_utils'

import type {IncomingMessage, ServerResponse} from 'node:http'


vi.mock('electron', () => import('../electron.test_utils'))
vi.mock('../utils/config.js', () => import('../electron.test_utils').then(m => m.config_mock))


// Mock Rollbar so can inspect config and calls
const rollbar = vi.hoisted(() => ({
    instance: {error: vi.fn(() => ({uuid: 'uuid1'}))},
    config: null as null|Record<string, unknown>,
}))
vi.mock('rollbar', () => ({default: {init: vi.fn((config:Record<string, unknown>) => {
    rollbar.config = config
    return rollbar.instance
})}}))


const original_platform = process.platform


// Reset between tests
beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    app.isPackaged = false
})
afterEach(() => {
    Object.defineProperty(process, 'platform', {value: original_platform})
    vi.doUnmock('../utils/paths.js')
    vi.doUnmock('../utils/immobile_config.js')
    vi.doUnmock('../utils/warning.js')
    vi.doUnmock('../utils/store.js')
    vi.doUnmock('../utils/window.js')
    vi.doUnmock('http')
})


describe('errors', () => {

    // Rollbar only transmits when packaged
    test('init config', async () => {
        await import('./errors.js')
        expect(rollbar.config!['transmit']).toBe(false)
        expect(rollbar.config!['environment']).toBe('development')
        expect(rollbar.config!['codeVersion']).toBe('v1.2.3')
        expect(rollbar.config!['accessToken']).toBe('token')
        vi.resetModules()
        app.isPackaged = true
        await import('./errors.js')
        expect(rollbar.config!['transmit']).toBe(true)
        expect(rollbar.config!['environment']).toBe('production')
    })

    // report_error returns the report's id
    test('report_error', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const {report_error} = await import('./errors.js')
        expect(report_error('oops')).toBe('uuid1')
        expect(rollbar.instance.error).toHaveBeenCalledWith('oops')
    })

    // EPERM only reported once but other errors always reported
    test('report_file_remove_fail limits EPERM', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const {report_file_remove_fail} = await import('./errors.js')
        const eperm = Object.assign(new Error('x'), {code: 'EPERM'})
        report_file_remove_fail(eperm, '/a')
        report_file_remove_fail(eperm, '/b')
        report_file_remove_fail(Object.assign(new Error('x'), {code: 'EBUSY'}), '/c')
        report_file_remove_fail(Object.assign(new Error('x'), {code: 'EBUSY'}), '/d')
        expect(rollbar.instance.error.mock.calls.map(c => c[0 as never])).toEqual([
            'user_file_remove error (EPERM)\nPath: /a',
            'user_file_remove error (EBUSY)\nPath: /c',
            'user_file_remove error (EBUSY)\nPath: /d',
        ])
    })

    type SendCallback = (uncaught:boolean, args:unknown[], payload:Record<string, unknown>)=>void

    // Home dir is redacted from payload
    test('onSendCallback redacts home dir', async () => {
        await import('./errors.js')
        const home = electron_mock.paths['home']!
        const payload:Record<string, unknown> = {
            body: {trace: {frames: [{filename: `${home}/app/main.js`}]}},
            other: `${home}/x`,
        }
        ;(rollbar.config!['onSendCallback'] as SendCallback)(false, [], payload)
        expect(JSON.stringify(payload)).not.toContain(home)
        expect(payload['other']).toBe('~/x')
    })

    // Windows paths contain backslashes which are escaped in JSON
    test('onSendCallback redacts Windows home dir', async () => {
        await import('./errors.js')
        const original = electron_mock.paths['home']!
        electron_mock.paths['home'] = 'C:\\Users\\JaneDoe'
        const payload:Record<string, unknown> = {
            body: {trace: {frames: [{filename: 'C:\\Users\\JaneDoe\\AppData\\stello\\main.js'}]}},
        }
        ;(rollbar.config!['onSendCallback'] as SendCallback)(false, [], payload)
        electron_mock.paths['home'] = original
        // BUG #rollbar-windows-home: home is matched against JSON-escaped text, so on Windows
        //      (where `\` is escaped to `\\`) the OS username is never redacted from reports
        expect(JSON.stringify(payload)).not.toContain('JaneDoe')
    })

    // Failures in redaction don't throw
    test('onSendCallback never throws', async () => {
        await import('./errors.js')
        app.getPath.mockImplementationOnce(() => {throw new Error('no home')})
        expect(() => (rollbar.config!['onSendCallback'] as SendCallback)(false, [], {a: 1}))
            .not.toThrow()
    })
})


describe('data', () => {

    interface DataScenario {
        missing?:boolean
        fail_warning?:boolean
        fail_config?:boolean
        lock?:boolean
    }

    async function load(scenario:DataScenario){
        // Import data setup with mocked paths
        const base = join(electron_mock.root, `data${Math.random()}`)
        const paths = {
            files_dir: join(base, 'Stello Files'),
            data_dir: join(base, 'Stello Files', 'Internal Data'),
            files_dir_missing: scenario.missing ?? false,
        }
        vi.doMock('../utils/paths.js', () => paths)
        const write_warning_file = vi.fn(() => {
            if (scenario.fail_warning){
                throw new Error('EPERM')
            }
        })
        vi.doMock('../utils/warning.js', () => ({write_warning_file}))
        const write_immobile_config = vi.fn(() => {
            if (scenario.fail_config){
                throw new Error('EPERM')
            }
        })
        vi.doMock('../utils/immobile_config.js', () => ({
            write_immobile_config, immobile_config_dir: '/appdata/stello'}))
        app.requestSingleInstanceLock.mockReturnValueOnce(scenario.lock ?? true)
        await import('./data.js')
        return {paths, write_warning_file, write_immobile_config}
    }

    // Normal startup creates dirs and sets userData
    test('creates dirs and sets userData', async () => {
        const {paths, write_warning_file, write_immobile_config} = await load({})
        expect(existsSync(paths.data_dir)).toBe(true)
        expect(write_warning_file).toHaveBeenCalledWith(paths.files_dir)
        expect(write_immobile_config).toHaveBeenCalledWith(paths.files_dir)
        expect(app.setPath).toHaveBeenCalledWith('userData', paths.data_dir)
        expect(app.exit).not.toHaveBeenCalled()
    })

    // Missing files dir uses tmp userData and doesn't create anything
    test('missing files dir uses tmp', async () => {
        const {paths, write_warning_file} = await load({missing: true})
        expect(app.setPath).toHaveBeenCalledWith('userData', join(tmpdir(), 'stello_removeable'))
        expect(existsSync(paths.files_dir)).toBe(false)
        expect(write_warning_file).not.toHaveBeenCalled()
    })

    // Inaccessible files dir shows error and exits
    test('warning file failure exits', async () => {
        const {paths} = await load({fail_warning: true})
        expect(dialog.showErrorBox).toHaveBeenCalledWith("Stello can't access its files",
            expect.stringContaining(paths.files_dir))
        expect(app.exit).toHaveBeenCalled()
    })

    // Inaccessible appData shows error and exits
    test('immobile config failure exits', async () => {
        await load({fail_config: true})
        expect(dialog.showErrorBox).toHaveBeenCalledWith(expect.any(String),
            expect.stringContaining('/appdata/stello'))
        expect(app.exit).toHaveBeenCalled()
    })

    // Second instance exits
    test('exits if another instance running', async () => {
        await load({lock: false})
        expect(app.exit).toHaveBeenCalled()
    })

    // Failing to create data dir shows error
    test('data dir failure exits', async () => {
        const base = join(electron_mock.root, `datafail${Math.random()}`)
        mkdirSync(base, {recursive: true})
        // A file where a dir is expected makes mkdir fail
        const {writeFileSync} = await import('node:fs')
        writeFileSync(join(base, 'blocker'), '')
        vi.doMock('../utils/paths.js', () => ({
            files_dir: base,
            data_dir: join(base, 'blocker', 'Internal Data'),
            files_dir_missing: false,
        }))
        vi.doMock('../utils/warning.js', () => ({write_warning_file: vi.fn()}))
        vi.doMock('../utils/immobile_config.js', () => ({
            write_immobile_config: vi.fn(), immobile_config_dir: ''}))
        await import('./data.js')
        expect(dialog.showErrorBox).toHaveBeenCalled()
        expect(app.exit).toHaveBeenCalled()
    })
})


describe('init', () => {

    async function load(version:string){
        // Import init with given stored version
        const store = {state: {version}, save: vi.fn()}
        vi.doMock('../utils/store.js', () => ({default: store}))
        await import('./init.js')
        return store
    }

    // Opening with an older version than last used is blocked
    test('blocks downgrade', async () => {
        const store = await load('2.0.0')
        expect(dialog.showErrorBox).toHaveBeenCalledWith("Download the latest version of Stello",
            expect.stringContaining('2.0.0'))
        expect(app.exit).toHaveBeenCalled()
        expect(store.save).not.toHaveBeenCalled()
    })

    // Upgrades record new version
    test('records upgrade', async () => {
        const store = await load('1.0.0')
        expect(store.state.version).toBe('1.2.3')
        expect(store.save).toHaveBeenCalled()
        expect(app.exit).not.toHaveBeenCalled()
    })

    // Same version doesn't save
    test('same version no-op', async () => {
        const store = await load('1.2.3')
        expect(store.save).not.toHaveBeenCalled()
    })

    // Security/cache settings applied and old cache removed
    test('sandbox, cache and old cache dir', async () => {
        const cache = join(electron_mock.paths['userData']!, 'Cache')
        mkdirSync(cache, {recursive: true})
        await load('1.2.3')
        expect(app.enableSandbox).toHaveBeenCalled()
        expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('disable-http-cache')
        await vi.waitFor(() => expect(existsSync(cache)).toBe(false))
    })
})


describe('menus', () => {

    // Mock context menu module
    beforeEach(() => {
        vi.doMock('electron-context-menu', () => ({default: vi.fn()}))
    })

    // Mac gets a custom application menu
    test('mac menu', async () => {
        Object.defineProperty(process, 'platform', {value: 'darwin'})
        await import('./menus.js')
        expect(Menu.setApplicationMenu).toHaveBeenCalled()
        const template = Menu.buildFromTemplate.mock.calls[0]![0] as {label?:string}[]
        expect(template[0]!.label).toBe('Stello')
        const {default: context_menu} = await import('electron-context-menu')
        expect(context_menu).toHaveBeenCalledWith(
            {showLookUpSelection: false, showSearchWithGoogle: false})
        expect(app.setAppUserModelId).toHaveBeenCalledWith('tech.gracious.stello')
    })

    // Others have no menu change
    test('non-mac has no menu', async () => {
        Object.defineProperty(process, 'platform', {value: 'linux'})
        await import('./menus.js')
        expect(Menu.setApplicationMenu).not.toHaveBeenCalled()
    })
})


describe('oauths', () => {

    type RequestHandler = (request:IncomingMessage, response:ServerResponse)=>Promise<void>

    async function load(){
        // Import with mocked http server and window
        const server = {
            handler: null as null|RequestHandler,
            listen: vi.fn(),
            close: vi.fn(),
        }
        vi.doMock('http', () => ({default: {createServer: (handler:RequestHandler) => {
            server.handler = handler
            return server
        }}}))
        const window = {webContents: {send: vi.fn()}}
        const activate_app = vi.fn(async () => window)
        vi.doMock('../utils/window.js', () => ({activate_app}))
        await import('./oauths.js')
        return {server, window, activate_app}
    }

    async function request(server:{handler:null|RequestHandler}, url:string|undefined){
        // Make a fake request and return what was written
        const response = {write: vi.fn(), writeHead: vi.fn(), end: vi.fn()}
        await server.handler!({url} as IncomingMessage, response as unknown as ServerResponse)
        expect(response.end).toHaveBeenCalled()
        return response
    }

    // Server listens on dev/prod port and closes on quit
    test('listen and close', async () => {
        const {server} = await load()
        expect(server.listen).toHaveBeenCalledWith(44933, '127.0.0.1')
        app.emit('quit')
        expect(server.close).toHaveBeenCalled()
        app.removeAllListeners('quit')
        vi.resetModules()
        app.isPackaged = true
        const prod = await load()
        expect(prod.server.listen).toHaveBeenCalledWith(44932, '127.0.0.1')
    })

    // Youtube proxy page
    test('youtube route', async () => {
        const {server} = await load()
        const response = await request(server, '/youtube?v=x')
        expect(String(response.write.mock.calls[0]![0])).toContain('<')
        expect(response.writeHead).not.toHaveBeenCalled()
    })

    // OAuth redirect forwarded to app and params cleared
    test('oauth route when ready', async () => {
        app.ready = true
        const {server, window} = await load()
        const response = await request(server, '/oauth?code=abc')
        expect(window.webContents.send).toHaveBeenCalledWith('oauth',
            'http://127.0.0.1:44933/oauth?code=abc')
        expect(response.writeHead).toHaveBeenCalledWith(303, {Location: '/'})
    })

    // OAuth redirect before ready just shows default page
    test('oauth route when not ready', async () => {
        app.ready = false
        const {server, activate_app} = await load()
        const response = await request(server, '/oauth?code=abc')
        expect(activate_app).not.toHaveBeenCalled()
        expect(response.write).toHaveBeenCalled()
        app.ready = true
    })

    // Default route
    test('default route', async () => {
        const {server} = await load()
        const response = await request(server, undefined)
        expect(response.write).toHaveBeenCalled()
    })
})


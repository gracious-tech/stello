
import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {app, BrowserWindow, config_mock, dialog, electron_mock} from './electron.test_utils'


vi.mock('electron', () => import('./electron.test_utils'))
vi.mock('./utils/config.js', () => import('./electron.test_utils').then(m => m.config_mock))

// Setup modules only have side effects which are tested separately
vi.mock('./setup/errors.js', () => ({}))
vi.mock('./setup/data.js', () => ({}))
vi.mock('./setup/init.js', () => ({}))
vi.mock('./setup/menus.js', () => ({}))
vi.mock('./setup/oauths.js', () => ({}))
vi.mock('./setup/services.js', () => ({}))
vi.mock('./setup/services_smtp.js', () => ({}))


// Mocks with state that tests can control
const state = vi.hoisted(() => ({
    paths: {app_path: '', files_dir_missing: false, linux_package_type: null as string|null},
    free_space: 50,
    access_error: false,
}))
vi.mock('./utils/paths.js', () => state.paths)
vi.mock('./utils/misc.js', () => ({get_free_space: async () => state.free_space}))
vi.mock('./utils/dialogs.js', () => ({locate_files_dir: vi.fn()}))
vi.mock('./utils/window.js', () => ({activate_app: vi.fn(), open_window: vi.fn()}))
vi.mock('fs', async import_original => {
    const actual = await import_original<typeof import('fs')>()
    return {
        ...actual,
        promises: {
            ...actual.promises,
            access: async () => {
                if (state.access_error){
                    throw new Error('EACCES')
                }
            },
        },
    }
})


// Mock auto updater
const updater = vi.hoisted(() => ({
    setFeedURL: vi.fn(),
    checkForUpdatesAndNotify: vi.fn(),
    autoRunAppAfterInstall: true,
}))
vi.mock('electron-updater', () => ({default: {autoUpdater: updater}}))


const original_platform = process.platform


function set_platform(platform:string){
    // Override process.platform
    Object.defineProperty(process, 'platform', {value: platform})
}


async function run_main(){
    // Import main and wait for the ready handler to complete
    vi.resetModules()
    let finished!:()=>void
    const done = new Promise<void>(resolve => {finished = resolve})
    // Detect completion by wrapping the promise whenReady returns
    app.whenReady.mockImplementationOnce(() => {
        const ready = Promise.resolve()
        return {
            then: (handler:()=>Promise<void>) => ready.then(handler).finally(finished),
        } as unknown as Promise<void>
    })
    await import('./main.js')
    await done
    const {open_window, activate_app} = await import('./utils/window.js')
    const {locate_files_dir} = await import('./utils/dialogs.js')
    return {open_window: vi.mocked(open_window), activate_app: vi.mocked(activate_app),
        locate_files_dir: vi.mocked(locate_files_dir)}
}


// Reset state
beforeEach(() => {
    vi.clearAllMocks()
    app.removeAllListeners()
    app.isPackaged = false
    state.paths.files_dir_missing = false
    state.paths.linux_package_type = null
    state.paths.app_path = '/opt/Stello'
    state.free_space = 50
    state.access_error = false
    config_mock.TESTING = false
    updater.checkForUpdatesAndNotify.mockResolvedValue(null)
    set_platform('linux')
})
afterEach(() => {
    set_platform(original_platform)
    vi.useRealTimers()
})


describe('startup', () => {

    // In dev, opens window without updating
    test('dev opens window', async () => {
        const {open_window} = await run_main()
        expect(open_window).toHaveBeenCalled()
        expect(updater.checkForUpdatesAndNotify).not.toHaveBeenCalled()
    })

    // Low disk space warning can quit
    test('low disk space quit', async () => {
        state.free_space = 1.2
        dialog.showMessageBoxSync.mockReturnValueOnce(0)
        const {open_window} = await run_main()
        expect(dialog.showMessageBoxSync).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Disk space critically low (1.2% free)'}))
        expect(app.quit).toHaveBeenCalled()
        expect(open_window).not.toHaveBeenCalled()
    })

    // Low disk space warning can be ignored
    test('low disk space open anyway', async () => {
        state.free_space = 1.2
        dialog.showMessageBoxSync.mockReturnValueOnce(1)
        const {open_window} = await run_main()
        expect(open_window).toHaveBeenCalled()
    })

    // Missing files dir prompts to locate then quits
    test('files dir missing', async () => {
        state.paths.files_dir_missing = true
        const {open_window, locate_files_dir} = await run_main()
        expect(locate_files_dir).toHaveBeenCalled()
        expect(app.quit).toHaveBeenCalled()
        expect(open_window).not.toHaveBeenCalled()
    })
})


describe('app events', () => {

    // Second instance and activate focus the app
    test('second-instance and activate', async () => {
        const {activate_app} = await run_main()
        app.emit('second-instance')
        app.emit('activate')
        expect(activate_app).toHaveBeenCalledTimes(2)
    })

    // Closing all windows quits except on Mac
    test('window-all-closed', async () => {
        await run_main()
        app.emit('window-all-closed')
        expect(app.quit).toHaveBeenCalledTimes(1)
        set_platform('darwin')
        app.emit('window-all-closed')
        expect(app.quit).toHaveBeenCalledTimes(1)
    })

    // Testing reopens window instead
    test('window-all-closed when testing', async () => {
        config_mock.TESTING = true
        const {open_window} = await run_main()
        open_window.mockClear()
        app.emit('window-all-closed')
        expect(open_window).toHaveBeenCalled()
        expect(app.quit).not.toHaveBeenCalled()
    })
})


describe('auto update', () => {

    // Packaged non-Windows apps check for updates
    test('checks for updates and notifies window when downloaded', async () => {
        app.isPackaged = true
        let downloaded!:()=>void
        const download = new Promise<void>(resolve => {downloaded = resolve})
        updater.checkForUpdatesAndNotify.mockResolvedValue({downloadPromise: download})
        const window = new BrowserWindow({})
        await run_main()
        expect(updater.setFeedURL).toHaveBeenCalledWith({provider: 'generic',
            url: 'https://releases.encrypted.news/electron'})
        expect(updater.autoRunAppAfterInstall).toBe(false)
        expect(updater.checkForUpdatesAndNotify).toHaveBeenCalledTimes(1)
        downloaded()
        await vi.waitFor(() => expect(window.webContents.send).toHaveBeenCalledWith('update_ready'))

        // Mac doesn't quit on window close normally, but does if update downloaded
        set_platform('darwin')
        app.emit('window-all-closed')
        expect(app.quit).toHaveBeenCalled()
        BrowserWindow.instances.length = 0
    })

    // Daily checks stop once an update is downloaded
    test('daily checks', async () => {
        vi.useFakeTimers({toFake: ['setInterval']})
        app.isPackaged = true
        await run_main()
        expect(updater.checkForUpdatesAndNotify).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(1000 * 60 * 60 * 24)
        expect(updater.checkForUpdatesAndNotify).toHaveBeenCalledTimes(2)
    })

    // Proposed releases used if flag file exists
    test('proposed releases', async () => {
        app.isPackaged = true
        mkdirSync(electron_mock.paths['userData']!, {recursive: true})
        writeFileSync(join(electron_mock.paths['userData']!, 'proposed'), '')
        await run_main()
        expect(updater.setFeedURL).toHaveBeenCalledWith({provider: 'generic',
            url: 'https://stello-releases.s3-us-west-2.amazonaws.com/electron_proposed'})
    })

    // Windows doesn't auto update
    test('no updates on windows', async () => {
        app.isPackaged = true
        set_platform('win32')
        await run_main()
        expect(updater.checkForUpdatesAndNotify).not.toHaveBeenCalled()
    })

    // Failed update checks must not cause unhandled rejections
    test('failed update check is handled', async () => {
        app.isPackaged = true
        const unhandled = vi.fn()
        process.on('unhandledRejection', unhandled)
        updater.checkForUpdatesAndNotify.mockRejectedValue(new Error('net::ERR_INTERNET_DISCONNECTED'))
        await run_main()
        await new Promise(resolve => {setTimeout(resolve, 10)})
        process.off('unhandledRejection', unhandled)
        // Failed update checks (offline etc) must not be unhandled rejections
        expect(unhandled).not.toHaveBeenCalled()
    })
})


describe('self-write permission', () => {

    // Can't write to self so warn and quit
    test('warns and quits when not writable', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        app.isPackaged = true
        state.access_error = true
        dialog.showMessageBoxSync.mockReturnValueOnce(0)
        const {open_window} = await run_main()
        const options = dialog.showMessageBoxSync.mock.calls[0]![0] as unknown as {message:string}
        expect(options.message).toContain('/opt/Stello')
        expect(app.quit).toHaveBeenCalled()
        expect(open_window).not.toHaveBeenCalled()
    })

    // Mac users running from DMG are told to move app
    test('mac outside Applications', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        app.isPackaged = true
        state.access_error = true
        set_platform('darwin')
        app.isInApplicationsFolder.mockReturnValueOnce(false)
        dialog.showMessageBoxSync.mockReturnValueOnce(1)
        const {open_window} = await run_main()
        const options = dialog.showMessageBoxSync.mock.calls[0]![0] as unknown as {message:string}
        expect(options.message).toContain('Applications folder')
        expect(open_window).toHaveBeenCalled()
    })

    // deb/rpm skip the check as they need sudo to update
    test('deb skips check', async () => {
        app.isPackaged = true
        state.access_error = true
        state.paths.linux_package_type = 'deb'
        const {open_window} = await run_main()
        expect(dialog.showMessageBoxSync).not.toHaveBeenCalled()
        expect(open_window).toHaveBeenCalled()
    })
})



import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {app, dialog, electron_mock, shell} from '../electron.test_utils'


vi.mock('electron', () => import('../electron.test_utils'))
vi.mock('../setup/errors.js', () => ({report_error: vi.fn(() => 'error-id')}))
vi.mock('./immobile_config.js', () => ({write_immobile_config: vi.fn()}))


// Reset mocks and module state (warn_eperm only shows once per module instance)
beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
})


describe('locate_files_dir', () => {

    async function run(){
        // Import modules fresh and run
        const {write_immobile_config} = await import('./immobile_config.js')
        const {locate_files_dir} = await import('./dialogs.js')
        locate_files_dir()
        return vi.mocked(write_immobile_config)
    }

    function stello_dir(){
        // Create a dir that looks like a Stello Files dir
        const dir = mkdtempSync(join(electron_mock.root, 'located-'))
        writeFileSync(join(dir, 'READ ME before moving this folder.txt'), '')
        return dir
    }

    // Quit does nothing
    test('quit', async () => {
        dialog.showMessageBoxSync.mockReturnValueOnce(0)
        const write = await run()
        expect(write).not.toHaveBeenCalled()
        expect(app.relaunch).not.toHaveBeenCalled()
    })

    // Starting fresh clears config and relaunches
    test('start fresh', async () => {
        dialog.showMessageBoxSync.mockReturnValueOnce(1)
        const write = await run()
        expect(write).toHaveBeenCalledWith(null)
        expect(app.relaunch).toHaveBeenCalled()
    })

    // Cancelling the picker does nothing
    test('find folder then cancel', async () => {
        dialog.showMessageBoxSync.mockReturnValueOnce(2)
        dialog.showOpenDialogSync.mockReturnValueOnce(undefined)
        const write = await run()
        expect(write).not.toHaveBeenCalled()
        expect(app.relaunch).not.toHaveBeenCalled()
    })

    // A valid folder is saved and app relaunched
    test('find valid folder', async () => {
        const dir = stello_dir()
        dialog.showMessageBoxSync.mockReturnValueOnce(2)
        dialog.showOpenDialogSync.mockReturnValueOnce([dir])
        const write = await run()
        expect(write).toHaveBeenCalledWith(dir)
        expect(app.relaunch).toHaveBeenCalled()
    })

    // An invalid folder warns and allows choosing again, then using one anyway
    test('invalid folder, choose again, then use anyway', async () => {
        const bad1 = mkdtempSync(join(electron_mock.root, 'bad-'))
        const bad2 = mkdtempSync(join(electron_mock.root, 'bad-'))
        dialog.showMessageBoxSync
            .mockReturnValueOnce(2)  // Find folder
            .mockReturnValueOnce(2)  // Choose again
            .mockReturnValueOnce(1)  // Use anyway
        dialog.showOpenDialogSync.mockReturnValueOnce([bad1]).mockReturnValueOnce([bad2])
        const write = await run()
        expect(dialog.showOpenDialogSync).toHaveBeenCalledTimes(2)
        expect(write).toHaveBeenCalledWith(bad2)
        expect(app.relaunch).toHaveBeenCalledTimes(1)
    })

    // Quitting from the invalid folder warning does nothing
    test('invalid folder then quit', async () => {
        const bad = mkdtempSync(join(electron_mock.root, 'bad-'))
        mkdirSync(bad, {recursive: true})
        dialog.showMessageBoxSync.mockReturnValueOnce(2).mockReturnValueOnce(0)
        dialog.showOpenDialogSync.mockReturnValueOnce([bad])
        const write = await run()
        expect(write).not.toHaveBeenCalled()
        expect(app.relaunch).not.toHaveBeenCalled()
    })
})


describe('warn_eperm', () => {

    const original_platform = process.platform

    function set_platform(platform:string){
        // Override process.platform
        Object.defineProperty(process, 'platform', {value: platform})
    }

    // Restore platform
    afterEach(() => {
        set_platform(original_platform)
    })

    // Reports error and only shows the dialog once
    test('shows dialog once per session', async () => {
        set_platform('linux')
        const {report_error} = await import('../setup/errors.js')
        const {warn_eperm} = await import('./dialogs.js')
        await warn_eperm('user_file_read', '/a/b')
        await warn_eperm('user_file_read', '/a/c')
        expect(report_error).toHaveBeenCalledTimes(1)
        expect(report_error).toHaveBeenCalledWith('Permission error (user_file_read)\nPath: /a/b')
        expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
        expect(shell.openExternal).not.toHaveBeenCalled()
    })

    // Non-mac users get the contact page including error details
    test('get help opens contact page', async () => {
        set_platform('win32')
        dialog.showMessageBox.mockResolvedValueOnce({response: 1})
        const {warn_eperm} = await import('./dialogs.js')
        await warn_eperm('user_file_write', '/x')
        const url = shell.openExternal.mock.calls[0]![0]
        expect(url.startsWith('https://gracious.tech/contact?desc=')).toBe(true)
        expect(decodeURIComponent(url)).toContain('Error ID: error-id')
        const options = dialog.showMessageBox.mock.calls[0]![0] as unknown as {buttons:string[]}
        expect(options.buttons[1]).toBe("Get help")
    })

    // Mac users get a specific guide
    test('mac opens guide page', async () => {
        set_platform('darwin')
        dialog.showMessageBox.mockResolvedValueOnce({response: 1})
        const {warn_eperm} = await import('./dialogs.js')
        await warn_eperm('user_file_write', '/x')
        expect(shell.openExternal).toHaveBeenCalledWith(
            'https://stello.news/guide/problem-permission-mac/')
    })
})


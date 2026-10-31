
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {join, sep} from 'node:path'

import {beforeAll, beforeEach, describe, expect, test, vi} from 'vitest'

import {app, BrowserWindow, dialog, electron_mock, invoke, safeStorage} from '../electron.test_utils'
import {warn_eperm} from '../utils/dialogs.js'
import {report_file_remove_fail} from './errors.js'


vi.mock('electron', () => import('../electron.test_utils'))
vi.mock('../utils/config.js', () => import('../electron.test_utils').then(m => m.config_mock))
vi.mock('../utils/dialogs.js', () => ({warn_eperm: vi.fn(async () => undefined)}))
vi.mock('./errors.js', () => ({report_file_remove_fail: vi.fn()}))
vi.mock('electron-updater', () => ({default: {autoUpdater: {autoRunAppAfterInstall: false}}}))


// Mock paths so files dir is within a tmp dir
const dirs = vi.hoisted(() => ({files_dir: '', data_dir: ''}))
vi.mock('../utils/paths.js', async () => {
    const {restrict_path} = await vi.importActual<typeof import('../utils/paths.js')>(
        '../utils/paths.js')
    return {...dirs, restrict_path}
})


// Allow tests to force fs errors for specific paths
const fs_errors = vi.hoisted(() => ({} as Record<string, string>))
vi.mock('fs', async import_original => {
    const actual = await import_original<typeof import('fs')>()
    const maybe_throw = (path:unknown) => {
        for (const [match, code] of Object.entries(fs_errors)){
            if (String(path).endsWith(match)){
                throw Object.assign(new Error(code), {code})
            }
        }
    }
    const wrap = <F extends (...args:never[])=>unknown>(fn:F) => ((...args:Parameters<F>) => {
        maybe_throw(args[0])
        return fn(...args)
    }) as F
    return {
        ...actual,
        readFileSync: wrap(actual.readFileSync),
        writeFileSync: wrap(actual.writeFileSync),
        rmSync: wrap(actual.rmSync),
    }
})


// Mock DNS
const dns_mock = vi.hoisted(() => ({resolveMx: vi.fn()}))
vi.mock('dns', () => ({promises: dns_mock}))


// Set files dir before first import (paths are captured when the mock is first loaded)
beforeAll(async () => {
    dirs.files_dir = mkdtempSync(join(electron_mock.root, 'files-'))
    dirs.data_dir = join(dirs.files_dir, 'Internal Data')
    await import('./services.js')
})


// Empty files dir and reset mocks for each test
beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(fs_errors)){
        delete fs_errors[key]
    }
    rmSync(dirs.files_dir, {recursive: true, force: true})
    mkdirSync(dirs.files_dir)
})


describe('paths', () => {

    // Paths exposed synchronously
    test('get_paths', () => {
        const event:{returnValue?:unknown} = {}
        electron_mock.ipc_listeners['get_paths']!(event)
        expect(event.returnValue).toEqual({
            files_dir: dirs.files_dir,
            data_dir: dirs.data_dir,
            internal_files_dir: join(dirs.files_dir, 'Internal Files'),
            sep,
        })
    })
})


describe('app_file_read', () => {

    // Files in app dir can be read
    test('reads app file', async () => {
        const result = await invoke('app_file_read', 'robots.txt') as ArrayBuffer
        const expected = readFileSync(join(import.meta.dirname, '..', 'app', 'robots.txt'))
        expect(Buffer.from(result)).toEqual(expected)
        expect(result.byteLength).toBe(expected.length)
    })

    // SECURITY Can't escape app dir
    test('rejects path outside app dir', async () => {
        await expect(invoke('app_file_read', '../main.ts')).rejects.toThrow('outside of app dir')
        await expect(invoke('app_file_read', '../app_evil/x')).rejects.toThrow('outside')
    })
})


describe('user files', () => {

    // Listing a dir, or empty if missing
    test('user_file_list', async () => {
        mkdirSync(join(dirs.files_dir, 'sub'))
        writeFileSync(join(dirs.files_dir, 'sub', 'a.txt'), 'a')
        expect(await invoke('user_file_list', 'sub')).toEqual(['a.txt'])
        expect(await invoke('user_file_list', 'missing')).toEqual([])
    })

    // SECURITY Can't escape files dir
    test('rejects escaping files dir', async () => {
        await expect(invoke('user_file_list', '..')).rejects.toThrow('outside of')
        await expect(invoke('user_file_read', '../x')).rejects.toThrow('outside of')
        await expect(invoke('user_file_write', '../x', new ArrayBuffer(1)))
            .rejects.toThrow('outside of')
        await expect(invoke('user_file_remove', '..')).rejects.toThrow('outside of')
    })

    // Sum of file sizes, or 0 if missing
    test('user_file_size_total', async () => {
        mkdirSync(join(dirs.files_dir, 'sub'))
        writeFileSync(join(dirs.files_dir, 'sub', 'a'), '123')
        writeFileSync(join(dirs.files_dir, 'sub', 'b'), '4567')
        expect(await invoke('user_file_size_total', 'sub')).toBe(7)
        expect(await invoke('user_file_size_total', 'missing')).toBe(0)
    })

    // Write then read, with dirs created as needed
    test('write and read', async () => {
        const data = new TextEncoder().encode('hello').buffer
        expect(await invoke('user_file_write', 'a/b/c.txt', data)).toBe(undefined)
        const result = await invoke('user_file_read', 'a/b/c.txt') as ArrayBuffer
        expect(new TextDecoder().decode(result)).toBe('hello')
        expect(result.byteLength).toBe(5)
    })

    // Missing files return null
    test('read missing returns null', async () => {
        expect(await invoke('user_file_read', 'nope.txt')).toBe(null)
    })

    // Permission errors warn the user
    test('read/write EPERM returns permission', async () => {
        fs_errors['blocked.txt'] = 'EPERM'
        expect(await invoke('user_file_read', 'blocked.txt')).toBe('permission')
        expect(await invoke('user_file_write', 'blocked.txt', new ArrayBuffer(1)))
            .toBe('permission')
        expect(warn_eperm).toHaveBeenCalledWith('user_file_read',
            join(dirs.files_dir, 'blocked.txt'))
        expect(warn_eperm).toHaveBeenCalledWith('user_file_write',
            join(dirs.files_dir, 'blocked.txt'))
    })

    // Other errors are thrown
    test('read/write other errors throw', async () => {
        fs_errors['busy.txt'] = 'EBUSY'
        await expect(invoke('user_file_read', 'busy.txt')).rejects.toThrow('EBUSY')
        await expect(invoke('user_file_write', 'busy.txt', new ArrayBuffer(1)))
            .rejects.toThrow('EBUSY')
    })

    // Removing works recursively and failures are only reported
    test('user_file_remove', async () => {
        mkdirSync(join(dirs.files_dir, 'dir', 'sub'), {recursive: true})
        await invoke('user_file_remove', 'dir')
        expect(existsSync(join(dirs.files_dir, 'dir'))).toBe(false)
        await invoke('user_file_remove', 'never-existed')
        expect(report_file_remove_fail).not.toHaveBeenCalled()
        fs_errors['locked'] = 'EPERM'
        await invoke('user_file_remove', 'locked')
        expect(report_file_remove_fail).toHaveBeenCalledWith(
            expect.objectContaining({code: 'EPERM'}), join(dirs.files_dir, 'locked'))
    })
})


describe('misc handlers', () => {

    // Restart flag set on updater
    test('restart_after_update', async () => {
        const {default: updater} = await import('electron-updater')
        await invoke('restart_after_update')
        expect(updater.autoUpdater.autoRunAppAfterInstall).toBe(true)
    })

    // MX records sorted by priority
    test('dns_mx', async () => {
        dns_mock.resolveMx.mockResolvedValueOnce([
            {exchange: 'b', priority: 20}, {exchange: 'a', priority: 10}])
        expect(await invoke('dns_mx', 'example.com')).toEqual(['a', 'b'])
        dns_mock.resolveMx.mockRejectedValueOnce(new Error('ENOTFOUND'))
        expect(await invoke('dns_mx', 'example.com')).toEqual([])
    })

    // OS encryption round trip
    test('os_encrypt/decrypt', async () => {
        const encrypted = await invoke('os_encrypt', 'secret') as ArrayBuffer
        expect(encrypted).toBeInstanceOf(ArrayBuffer)
        expect(await invoke('os_decrypt', encrypted)).toBe('secret')
    })

    // Null when OS encryption unavailable
    test('os_encrypt/decrypt unavailable', async () => {
        safeStorage.isEncryptionAvailable.mockReturnValue(false)
        expect(await invoke('os_encrypt', 'secret')).toBe(null)
        expect(await invoke('os_decrypt', new ArrayBuffer(1))).toBe(null)
        safeStorage.isEncryptionAvailable.mockReturnValue(true)
    })
})


describe('html_to_pdf', () => {

    // Cancelling save does nothing
    test('cancelled', async () => {
        dialog.showSaveDialog.mockResolvedValueOnce({filePath: undefined})
        expect(await invoke('html_to_pdf', '<p>hi</p>', 'doc')).toBe(null)
        expect(BrowserWindow.instances).toHaveLength(0)
    })

    async function export_pdf(locale:string){
        // Export PDF and return the window used and save path
        const path = join(dirs.files_dir, 'out.pdf')
        dialog.showSaveDialog.mockResolvedValueOnce({filePath: path})
        app.getLocale.mockReturnValueOnce(locale)
        BrowserWindow.instances.length = 0
        expect(await invoke('html_to_pdf', '<p>hi</p>', 'doc')).toBe(null)
        return {window: BrowserWindow.instances[0]!, path}
    }

    // PDF saved and tmp html removed
    test('saves pdf', async () => {
        const {window, path} = await export_pdf('en-US')
        expect(dialog.showSaveDialog).toHaveBeenCalledWith(
            expect.objectContaining({defaultPath: 'doc.pdf'}))
        expect(window.loadFile).toHaveBeenCalledWith(path + '.html')
        expect(window.webContents.printToPDF).toHaveBeenCalledWith({pageSize: 'Letter'})
        expect(readFileSync(path, 'utf8')).toBe('%PDF')
        expect(existsSync(path + '.html')).toBe(false)
    })

    // Paper size depends on locale
    test('paper size by locale', async () => {
        const au = await export_pdf('en-AU')
        expect(au.window.webContents.printToPDF).toHaveBeenCalledWith({pageSize: 'A4'})
        const no_country = await export_pdf('fr')
        expect(no_country.window.webContents.printToPDF).toHaveBeenCalledWith({pageSize: 'Letter'})
    })

    // Offscreen window should not be left open
    test('closes offscreen window', async () => {
        const {window} = await export_pdf('en-US')
        // Hidden offscreen window must be destroyed after each export
        expect(window.destroyed).toBe(true)
    })
})


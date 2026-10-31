
import {beforeAll, beforeEach, describe, expect, test, vi} from 'vitest'

import {contextBridge, ipcRenderer} from './electron.test_utils'

import type {NativeInterface} from './native_types'


vi.mock('electron', () => import('./electron.test_utils'))


let native:NativeInterface


// Load preload and get the exposed interface
beforeAll(async () => {
    await import('./preload.js')
    expect(contextBridge.exposeInMainWorld.mock.calls[0]![0]).toBe('app_native')
    native = contextBridge.exposeInMainWorld.mock.calls[0]![1] as NativeInterface
})
beforeEach(() => {
    ipcRenderer.invoke.mockReset()
})


describe('preload', () => {

    // Paths fetched synchronously
    test('get_paths', () => {
        ipcRenderer.sendSync.mockReturnValueOnce({files_dir: '/f'})
        expect(native.get_paths()).toEqual({files_dir: '/f'})
        expect(ipcRenderer.sendSync).toHaveBeenCalledWith('get_paths')
    })

    // Simple pass-through methods invoke ipc with same args
    test.each([
        ['app_file_read', ['a']],
        ['user_file_list', ['a']],
        ['user_file_size_total', ['a']],
        ['user_file_remove', ['a']],
        ['dns_mx', ['example.com']],
        ['os_encrypt', ['secret']],
        ['os_decrypt', [new ArrayBuffer(1)]],
        ['html_to_pdf', ['<p></p>', 'name']],
        ['smtp_send', [{host: 'h'}, {to: 't'}]],
    ] as [keyof NativeInterface, unknown[]][])('%s', async (method, args) => {
        ipcRenderer.invoke.mockResolvedValueOnce('result')
        const fn = native[method] as (...a:unknown[])=>Promise<unknown>
        expect(await fn(...args)).toBe('result')
        expect(ipcRenderer.invoke).toHaveBeenCalledWith(method, ...args)
    })

    // Reads return data, null, or throw MustAllow on permission error
    test('user_file_read', async () => {
        const data = new ArrayBuffer(2)
        ipcRenderer.invoke.mockResolvedValueOnce(data)
        expect(await native.user_file_read('a')).toBe(data)
        ipcRenderer.invoke.mockResolvedValueOnce(null)
        expect(await native.user_file_read('a')).toBe(null)
        ipcRenderer.invoke.mockResolvedValueOnce('permission')
        await expect(native.user_file_read('a')).rejects.toBe('MustAllow')
    })

    // Writes throw MustAllow on permission error
    test('user_file_write', async () => {
        ipcRenderer.invoke.mockResolvedValueOnce(undefined)
        await native.user_file_write('a', new ArrayBuffer(1))
        ipcRenderer.invoke.mockResolvedValueOnce('permission')
        await expect(native.user_file_write('a', new ArrayBuffer(1))).rejects.toBe('MustAllow')
    })

    // Restart is fire and forget
    test('restart_after_update', () => {
        ipcRenderer.invoke.mockResolvedValueOnce(undefined)
        native.restart_after_update()
        expect(ipcRenderer.invoke).toHaveBeenCalledWith('restart_after_update')
    })

    // Email settings test passes auth flag and returns error
    test('test_email_settings', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        ipcRenderer.invoke.mockResolvedValueOnce(null)
        expect(await native.test_email_settings({host: 'h'} as never)).toBe(null)
        expect(ipcRenderer.invoke).toHaveBeenCalledWith('test_email_settings', {host: 'h'}, true)
        ipcRenderer.invoke.mockResolvedValueOnce({code: 'auth', details: ''})
        expect(await native.test_email_settings({host: 'h'} as never, false))
            .toEqual({code: 'auth', details: ''})
        expect(warn).toHaveBeenCalled()
    })

    // Listeners registered for update/oauth events
    test('listeners', () => {
        const update_handler = vi.fn()
        const oauth_handler = vi.fn()
        native.on_update_ready(update_handler)
        native.on_oauth(oauth_handler)
        const listeners = Object.fromEntries(ipcRenderer.on.mock.calls.map(
            call => [call[0 as never], call[1 as never]])) as Record<string, (...a:unknown[])=>void>
        listeners['update_ready']!({})
        listeners['oauth']!({}, 'http://x/oauth')
        expect(update_handler).toHaveBeenCalled()
        expect(oauth_handler).toHaveBeenCalledWith('http://x/oauth')
    })
})


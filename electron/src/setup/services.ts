
import path from 'path'
import {readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync} from 'fs'
import {promises as dns} from 'dns'

import {ipcMain, safeStorage} from 'electron'
import {autoUpdater} from 'electron-updater'

import {get_path} from '../utils/config'
import {files_dir, restrict_path} from '../utils/paths'


ipcMain.handle('app_file_read', async (event, relative_path:string) => {
    // Read a file and return as an ArrayBuffer (must be within app's dir)
    // WARN During dev this will serve app assets from last build and not current serve
    const app_dir = path.resolve(get_path(), 'app') + path.sep
    const asset_path = path.resolve(app_dir, relative_path)
    if (!asset_path.startsWith(app_dir)){
        throw new Error("Cannot access file outside of app dir")
    }
    return readFileSync(asset_path).buffer
})


ipcMain.handle('user_file_list', async (event, relative_path:string):Promise<string[]> => {
    // List items in a dir in the user's files dir
    const full_path = restrict_path(files_dir, relative_path)
    try {
        return readdirSync(full_path)
    } catch {
        return []  // Path probably doesn't exist yet
    }
})


ipcMain.handle('user_file_write', async (event, relative_path:string, data:ArrayBuffer) => {
    // Write a file to the user's files dir
    const full_path = restrict_path(files_dir, relative_path)
    mkdirSync(path.dirname(full_path), {recursive: true})
    writeFileSync(full_path, Buffer.from(data))
})


ipcMain.handle('user_file_remove', async (event, relative_path:string):Promise<void> => {
    // Remove a file or dir recursively in the user's files dir
    const full_path = restrict_path(files_dir, relative_path)
    rmSync(full_path, {force: true, recursive: true})
})


ipcMain.handle('restart_after_update', async event => {
    // Enable setting that will trigger a restart when window closed and update done
    // NOTE Does not actually trigger update or close windows, should do that separately
    autoUpdater.autoRunAppAfterInstall = true
})


ipcMain.handle('dns_mx', async (event, host:string) => {
    // Do a DNS request for MX records and return domains ordered by priority
    try {
        const results = await dns.resolveMx(host)
        results.sort((a, b) => a.priority - b.priority)
        return results.map(record => record.exchange)
    } catch {
        return []
    }
})


ipcMain.handle('os_encrypt', async (event, secret:string):Promise<ArrayBuffer|null> => {
    // Encrypt a string using OS keyring (returns null if can't encrypt)
    if (safeStorage.isEncryptionAvailable()){
        return safeStorage.encryptString(secret).buffer
    }
    return null
})


ipcMain.handle('os_decrypt', async (event, encrypted:ArrayBuffer):Promise<string|null> => {
    // Decrypt a string using OS keyring (returns null if can't decrypt)
    if (safeStorage.isEncryptionAvailable()){
        return safeStorage.decryptString(Buffer.from(encrypted))
    }
    return null
})


import path from 'path'
import {readFileSync, writeFileSync} from 'fs'
import {promises as dns} from 'dns'

import {ipcMain, safeStorage} from 'electron'
import {autoUpdater} from 'electron-updater'

import {get_path} from '../utils/config'
import {files_dir} from '../utils/paths'


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


ipcMain.handle('write_user_file', async (event, relative_path:string, data:ArrayBuffer) => {
    // Write a file to the user's files dir
    const full_path = path.resolve(files_dir, relative_path)
    if (!full_path.startsWith(files_dir + path.sep)){
        throw new Error(`Cannot access file outside of: ${files_dir}`)
    }
    writeFileSync(full_path, Buffer.from(data))
})


ipcMain.handle('update', async event => {
    // Quit/install/restart
    autoUpdater.quitAndInstall(false, true)
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

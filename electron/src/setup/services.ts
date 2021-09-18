
import path from 'path'
import {readFileSync} from 'fs'
import {promises as dns} from 'dns'

import {ipcMain} from 'electron'
import {autoUpdater} from 'electron-updater'

import {get_path} from '../utils/config'


ipcMain.handle('read_file', async (event, relative_path:string) => {
    // Read a file and return as an ArrayBuffer (must be within app's dir)
    const app_dir = path.resolve(get_path(), 'app') + path.sep
    const asset_path = path.resolve(app_dir, relative_path)
    if (!asset_path.startsWith(app_dir)){
        throw new Error("Cannot access file outside of app dir")
    }
    return readFileSync(asset_path).buffer
})


ipcMain.handle('update', async event => {
    // Quit/install/restart
    autoUpdater.quitAndInstall(false, true)
})


ipcMain.handle('dns_mx', async (event, host) => {
    // Do a DNS request for MX records and return domains ordered by priority
    try {
        const results = await dns.resolveMx(host)
        results.sort((a, b) => a.priority - b.priority)
        return results.map(record => record.exchange)
    } catch {
        return []
    }
})


import path from 'path'
import {readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, statSync} from 'fs'
import {promises as dns} from 'dns'

import {app, BrowserWindow, dialog, ipcMain, safeStorage} from 'electron'
import electron_updater from 'electron-updater'
const {autoUpdater} = electron_updater  // Get around CJS module issue

import {get_path} from '../utils/config.js'
import {files_dir, data_dir, restrict_path} from '../utils/paths.js'


ipcMain.on('get_paths', event => {
    // Expose paths to renderer (synchronous)
    const internal_files_dir = path.join(files_dir, 'Internal Files')
    event.returnValue = {files_dir, data_dir, internal_files_dir, sep: path.sep}
})


ipcMain.handle('app_file_read', async (event, relative_path:string) => {
    // Read a file and return as an ArrayBuffer (must be within app's dir)
    // WARN During dev this will serve app assets from last build and not current serve
    const app_dir = path.resolve(get_path(), 'app') + path.sep
    const asset_path = path.resolve(app_dir, relative_path)
    if (!asset_path.startsWith(app_dir)){
        throw new Error("Cannot access file outside of app dir")
    }
    // WARN Uint8Array wrapper required so .buffer returns exact bytes (not a shared pool buffer)
    return new Uint8Array(readFileSync(asset_path)).buffer
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


ipcMain.handle('user_file_size_total', async (event, relative_path:string):Promise<number> => {
    // Get total size in bytes of all files in a dir in the user's files dir
    const full_path = restrict_path(files_dir, relative_path)
    try {
        return readdirSync(full_path)
            .reduce((sum, name) => sum + statSync(path.join(full_path, name)).size, 0)
    } catch {
        return 0  // Path probably doesn't exist yet
    }
})


ipcMain.handle('user_file_read', async (event, relative_path:string):Promise<ArrayBuffer> => {
    // Read a file from the user's files dir
    const full_path = restrict_path(files_dir, relative_path)
    // WARN Uint8Array wrapper required so .buffer returns exact bytes (not a shared pool buffer)
    return new Uint8Array(readFileSync(full_path)).buffer
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
        // WARN Uint8Array wrapper required so .buffer returns exact bytes (not a shared pool)
        return new Uint8Array(safeStorage.encryptString(secret)).buffer
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


ipcMain.handle('html_to_pdf', async (event, html:string, filename:string):Promise<null> => {
    // Render HTML to PDF and prompt user for save location

    // Ask user where to save it
    const dialog_choice = await dialog.showSaveDialog({
        title: "Save PDF",
        defaultPath: `${filename}.pdf`,
    })
    if (!dialog_choice.filePath){
        return null
    }

    // Save tmp HTML file since loading as data URL can cause issues if too large etc.
    const tmp_file = dialog_choice.filePath + '.html'
    writeFileSync(tmp_file, html)

    // Create an offscreen/headless browser window
    const window = new BrowserWindow({
        show: false,  // Don't show window
        webPreferences: {
            offscreen: true,  // Don't render visually
        },
    })

    // Load the HTML into it
    await window.loadFile(tmp_file)

    // Detect preferred paper size
    const country = app.getLocale().split('-')[1]?.toUpperCase() ?? 'US'
    const prefer_letter = ['US', 'CA', 'MX'].includes(country)

    // Generate the PDF
    const pdf_buffer = await window.webContents.printToPDF({
        pageSize: prefer_letter ? 'Letter' : 'A4',
    })

    // Save PDF and rm tmp file
    writeFileSync(dialog_choice.filePath, pdf_buffer)
    rmSync(tmp_file)

    return null
})

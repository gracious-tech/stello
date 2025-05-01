

// Trigger setup steps
// WARN Order matters
import './setup/errors'
import './setup/data'  // WARN Must happen before all other imports which will rely on path set
import './setup/init'
import './setup/menus'
import './setup/oauths'
import './setup/services'
import './setup/services_smtp'

// WARN Electron overrides `fs` module with magic for asar files, which breaks `access()` test
import {promises as fs, constants as fs_constants, existsSync} from 'original-fs'
import {join} from 'node:path'

import {app, BrowserWindow, dialog, session} from 'electron'
import {autoUpdater} from 'electron-updater'
import check_disk_space from 'check-disk-space'

import {get_path, TESTING} from './utils/config'
import {activate_app, open_window} from './utils/window'
import {app_path, data_dir} from './utils/paths'


// Setup that relies on ready event
void app.whenReady().then(async () => {

    // Load vue dev tools extension if available (must load before page does)
    if (!app.isPackaged){
        const vue_ext_path = get_path('../.chrome_ext_vue')
        try {
            await fs.access(vue_ext_path)  // Throw when missing, as below just blocks with no throw
            await session.defaultSession.loadExtension(vue_ext_path, {allowFileAccess: true})
        } catch {
            console.warn(`Failed to load Vue dev tools extension at: ${vue_ext_path}`)
        }
    }

    // Try to auto-update (if packaging format supports it)
    // NOTE Appx updates are handled by the Windows store and Windows portable can't update at all
    let update_downloaded = false
    if (app.isPackaged && (process.platform === 'darwin' || process.env['APPIMAGE'])){

        // If empty file `proposed` exists in internal data folder then check for proposed releases
        const proposed = existsSync(join(app.getPath('userData'), 'proposed'))
        let releases_url = 'https://releases.encrypted.news/electron'
        if (proposed){
            // Access directly rather than via CDN to avoid caching delays
            releases_url = 'https://stello-releases.s3-us-west-2.amazonaws.com/electron_proposed'
        }
        console.info(`Checking for update at: ${releases_url}`)

        // Configure auto-updater
        autoUpdater.setFeedURL({
            provider: 'generic',
            url: releases_url,
        })
        autoUpdater.autoRunAppAfterInstall = false  // Only needed if user clicked "restart"
        const check_for_updates = () => {
            if (update_downloaded){
                return  // Don't repeat if already downloaded an update
            }
            void autoUpdater.checkForUpdatesAndNotify().then(result => {
                // Update variable when download done
                void result?.downloadPromise?.then(() => {
                    update_downloaded = true
                    // Notify app
                    BrowserWindow.getAllWindows()[0]?.webContents.send('update_ready')
                })
            })
        }

        // Check for updates
        // WARN Always do this, otherwise can end up with an unupdatable installation
        //      e.g. `fs.access` test in past has had a bug and was actually fine to update
        check_for_updates()
        // Check every day, as Mac users especially often leave programs open forever
        setInterval(check_for_updates, 1000 * 60 * 60 * 24)

        // Warn if app cannot overwrite itself (and .'. can't update)
        try {
            await fs.access(app_path, fs_constants.W_OK)
        } catch (error){
            console.error(error)
            let msg = `Stello is not able to auto-update because it doesn't have permission`
                + ` to write to itself. Please correct the permissions for:\n\n${app_path}`
            if (process.platform === 'darwin' && !app.isInApplicationsFolder()){
                // App is most likely running from a read-only mount of the DMG
                msg = "Please move Stello into your Applications folder and open it from there,"
                    + " otherwise you will not be able to receive important updates."
            }
            const button_i = dialog.showMessageBoxSync({
                title: "Stello is not yet installed properly",
                message: msg,
                type: 'warning',
                buttons: ["CLOSE", "OPEN ANYWAY"],
                defaultId: 0,
                cancelId: 0,
            })
            if (button_i === 0){
                app.quit()
                return  // Avoid brief opening of window (as `app.quit()` is async)
            }
        }
    }

    // Warn if disk space low as Chromium may wipe data if < 2%
    // See https://github.com/electron/electron/issues/41877#issuecomment-2844841416
    const disk_space = await check_disk_space(data_dir)
    const disk_space_percent = Math.floor(disk_space.free / disk_space.size * 100)
    if (disk_space_percent < 5){
        const button_i = dialog.showMessageBoxSync({
            title: `Disk space critically low (${disk_space_percent}% free)`,
            message: "Stello may lose all its data if you run out of disk space, or get below 2%.",
            type: 'warning',
            buttons: ["CLOSE", "OPEN ANYWAY"],
            defaultId: 0,
            cancelId: 0,
        })
        if (button_i === 0){
            app.quit()
            return  // Avoid brief opening of window (as `app.quit()` is async)
        }
    }

    // Open primary window for first time
    void open_window()

    // Handle attempts to open another instance (e.g. via terminal etc)
    app.on('second-instance', () => {
        void activate_app()
    })

    // Handle activation of app (e.g. clicking app in dock on Mac)
    app.on('activate', () => {
        void activate_app()
    })

    app.on('window-all-closed', () => {
        if (TESTING){
            // Auto-reopen window when closed during testing, so have new session for each test
            void open_window()
        } else if (process.platform !== 'darwin' || update_downloaded){
            // End this process if no windows, unless Mac where it's normal to keep app in dock
            // NOTE If update downloaded, always do a full quit so update applied when reopened
            app.quit()
        }
    })
})



// Setup error reporting before all else
import './setup/errors'

// WARN Electron overrides `fs` module with magic for asar files, which breaks `access()` test
import {promises as fs, constants as fs_constants} from 'original-fs'

import {app, BrowserWindow, dialog, session} from 'electron'
import {autoUpdater} from 'electron-updater'

import {get_path, TESTING} from './utils/config'
import {activate_app, open_window} from './utils/window'


// Don't open if another instance of Stello is already running
// NOTE The other instance will receive an event and focus itself instead
if (!app.requestSingleInstanceLock()){
    app.quit()
    process.exit()  // Avoid executing any further (as `app.quit()` is async)
}


// SECURITY Enable sandboxing of renderers
app.enableSandbox()


// Setup app
import './setup/menus'
import './setup/oauths'
import './setup/services'
import './setup/services_smtp'


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
    // NOTE Updates on Windows are currently handled by the Windows Store
    let update_downloaded = false
    if (app.isPackaged && (process.platform === 'darwin' || process.env['APPIMAGE'])){

        // Check for updates
        // WARN Always do this, otherwise can end up with an unupdatable installation
        //      e.g. `fs.access` test in past has had a bug and was actually fine to update
        autoUpdater.setFeedURL({
            provider: 'generic',
            url: 'https://releases.stello.news/electron/',
        })
        void autoUpdater.checkForUpdatesAndNotify().then(result => {
            // Update variable when download done
            result?.downloadPromise?.then(() => {
                update_downloaded = true
                // Notify app
                BrowserWindow.getAllWindows()[0]?.webContents.send('update_ready')
            })
        })

        // Warn if app cannot overwrite itself (and .'. can't update)
        // NOTE If an AppImage, need to test the AppImage file rather than currently unpackaged code
        const app_path = process.env['APPIMAGE'] || app.getAppPath()
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

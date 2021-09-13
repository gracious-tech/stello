
import {app, BrowserWindow, session, shell} from 'electron'

import {get_path, TESTING} from './config'


export async function activate_app(){
    // Activate the app, ensuring it is open and focused, and only ever has one window
    let window = BrowserWindow.getAllWindows()[0]
    if (window){
        // Window already exists, so bring it to front and focus it
        if (window.isMinimized()){
            window.restore()
        }
        window.show()  // Raises and gives focus (just `focus()` doesn't work on Windows/Mac)
    } else {
        // No window yet so open one
        // NOTE Usually just for Macs where it's normal to keep app running despite window close
        window = await open_window()
    }
    return window
}


export async function open_window(){
    // Create the browser window for the app

    // Determine session (so when testing can wipe data after each test)
    const window_session = TESTING ? session.fromPartition('test') : session.defaultSession
    if (TESTING){
        await window_session.clearStorageData()
    }

    // Open window
    const window = new BrowserWindow({
        width: 1000,
        height: 800,
        icon: get_path('assets/icon.png'),
        backgroundColor: '#000000',  // Avoid white flash before first paint
        webPreferences: {
            preload: get_path('preload.js'),
            webSecurity: false,  // TODO Remove when alternative for CORS issues implemented
            session: window_session,
            nativeWindowOpen: true,  // Will be the default in future (set to silence warning)
        },
    })

    // Hide menu bar (but don't remove menu so can still open dev tools with shortcut on production)
    // NOTE Doesn't work on macOS since menu is part of system bar
    if (process.platform !== 'darwin'){
        window.setMenuBarVisibility(false)
    }

    // Env specific
    if (app.isPackaged){
        // Production
    } else {
        // Development
        window.webContents.openDevTools()
    }

    // Navigate to the app
    const load_index = () => {
        if (app.isPackaged){
            void window.loadFile(get_path('app/index.html'))
        } else {
            // Loading from a port in dev allows for hot module reloading
            void window.loadURL('http://127.0.0.1:8000')
        }
    }
    load_index()

    // Ensure cannot navigate away from app and instead open all other URLs in system browser
    const handle_navigation = function(url:string){

        // Determine current file URL
        const current_file_url = window.webContents.getURL().split('#')[0]!

        // Handle action
        if (url.startsWith(current_file_url)){
            // The only valid action for internal nav is to reload upon error
            // NOTE Reload file so nav to root in case displaying current page causes the error
            load_index()
        } else {
            void shell.openExternal(url)
        }
    }
    window.webContents.on('will-navigate', (event, url) => {
        // Listens for navigation requests (mainly just external links since app is single page)
        handle_navigation(url)
        // Prevent electron from changing the URL or creating a new window itself
        event.preventDefault()
    })
    window.webContents.setWindowOpenHandler(details => {
        // Handles requests to open a new window (e.g. _blank links)
        handle_navigation(details.url)
        // Prevent electron from creating a new window itself
        return {action: 'deny'}
    })

    return window
}

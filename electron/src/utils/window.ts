
import {app, BrowserWindow, session, shell} from 'electron'

import store from './store'
import {get_path, TESTING, CONFIG} from './config'


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

    // Remember previous window position
    let win_bounds = {width: 1000, height: 800}
    if (store.state.window_bounds){
        // SECURITY Prevent injecting arbitrary params into BrowserWindow constructor
        win_bounds = (({width, height, x, y}) => ({width, height, x, y}))(store.state.window_bounds)
    }

    // Open window
    const window = new BrowserWindow({
        ...win_bounds,
        icon: get_path('assets/icon.png'),
        backgroundColor: '#000000',  // Avoid white flash before first paint
        webPreferences: {
            preload: get_path('preload.js'),
            session: window_session,
        },
    })

    // Remember if was previously maximized
    if (store.state.window_maximized){
        window.maximize()
    }

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
        } else if (url.startsWith('https://') || url.startsWith('http://')){
            // SECURITY Don't allow opening any protocols other than HTTP
            //     as could then open any app on user's computer and possibly trigger harmful events
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

    // Disable CORS when it blocks access to a required origin (security still handled by CSP)
    const no_cors = {urls: [
        `${CONFIG.hosted_api}*`,
        'https://*.amazonaws.com/*',
        'https://login.microsoftonline.com/*',
        'https://gmail.googleapis.com/*',
    ]}
    window.webContents.session.webRequest.onBeforeSendHeaders(no_cors, (details, callback) => {
        for (const header of Object.keys(details.requestHeaders)){
            if (header.toLowerCase() === 'origin'){
                // Don't send origin header as may trigger origin mismatch (e.g. Microsoft OAuth)
                delete details.requestHeaders[header]
            }
        }
        callback({requestHeaders: details.requestHeaders})
    })
    window.webContents.session.webRequest.onHeadersReceived(no_cors, (details, callback) => {

        // Must first convert all header keys to lowercase to prevent duplication when adding
        const headers = Object.fromEntries(Object.entries(details.responseHeaders ?? {}).map(
            ([k, v]) => [k.toLowerCase(), v],
        ))

        // Ensure every response says any origin is allowed
        headers['access-control-allow-origin'] = ['*']

        if (details.method === 'OPTIONS'){
            // OPTIONS requests expect extra CORS headers
            headers['access-control-allow-headers'] = ['*']
            headers['access-control-allow-methods'] = ['*']
            // Preflight OPTIONS request may get rejected (e.g. if server doesn't support CORS)
            // So ignore any errors and always return success so actual request still gets sent
            callback({responseHeaders: headers, statusLine: '200 OK'})
        } else {
            callback({responseHeaders: headers})
        }
    })

    // Save window position when closed
    window.on('close', () => {
        store.state.window_bounds = window.getNormalBounds()
        store.state.window_maximized = window.isMaximized()
        void store.save()
    })

    return window
}

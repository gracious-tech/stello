
import {app, BrowserWindow, session, shell, screen} from 'electron'

import store from './store.js'
import {get_path, TESTING, CONFIG} from './config.js'


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

    // Get the size of the widest monitor available
    // This is a rough way of ensuring the window is likely to fit an available monitor,
    // even if it doesn't actually end up being on that monitor
    let max_width = 1200  // NOTE These values are not actually needed
    let max_height = 800
    for (const display of screen.getAllDisplays()){
        if (display.bounds.width > max_width){
            max_width = display.bounds.width
            max_height = display.bounds.height
        }
    }

    // Restore previous window size
    // WARN Window positioning is very complex and have to account for multi-monitor setups
    //   e.g. A secondary monitor may have negative position relative to the primary monitor
    //   And when things go wrong it can make Stello unusable
    //   So just restoring window size and letting OS determine position each time
    const min_width = 1200  // Wide enough to display drafts/columns comfortably
    const min_height = 800
    let window_width = min_width
    let window_height = min_height
    if (store.state.window_bounds){
        // Don't exceed largest monitor available and don't be smaller than min usable size
        // This avoids being invisible if user make window tiny by accident and closed Stello
        window_width = Math.max(Math.min(store.state.window_bounds.width, max_width), min_width)
        window_height = Math.max(Math.min(store.state.window_bounds.height, max_height), min_height)
    }

    // Open window
    const window = new BrowserWindow({
        width: window_width,
        height: window_height,
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

    // Open DevTools in development (skip when testing as it confuses Playwright's firstWindow())
    if (!app.isPackaged && !TESTING){
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
    // WARN These overrides do NOT affect dev tools which will only show original status/headers
    // If want to test then should await fetch(url, {mode: 'cors'}) in app and examine headers
    //     WARN Be sure to test a URL below as other urls do not get headers modified
    const no_cors = {urls: [
        `${CONFIG.hosted_api}*`,
        'https://*.amazonaws.com/*',
        'https://login.microsoftonline.com/*',
        'https://gmail.googleapis.com/*',
    ]}
    window.webContents.session.webRequest.onHeadersReceived(no_cors, (details, callback) => {

        /* If an OPTIONS response, completely replace it with allow all requests
            NOTE response may be 400 if to S3 bucket that doesn't have a CORS policy.
            OPTIONS is just to determine if actual request should be sent or not so completely
            meaningless for actual request and can be completely replaced.
            The JS code never gets access to anything in the OPTIONS request or response.
        */
        if (details.method === 'OPTIONS'){
            const http_version = details.statusLine.split(' ')[0]
            callback({
                // Completely replace status and headers in case server responded with failure
                statusLine: `${http_version} 200 OK`,
                responseHeaders: {
                    'access-control-allow-origin': '*',
                    'access-control-allow-methods': '*',
                    'access-control-allow-headers': '*',
                },
            })
            return
        }

        // For actual response, ensure all headers are available in JS
        const new_headers = {
            'access-control-allow-origin': ['*'],
            'access-control-expose-headers': ['*'],
        }

        // Remove any existing clashes regardless of case
        const new_headers_lower = Object.keys(new_headers).map(k => k.toLowerCase())
        const old_headers = details.responseHeaders ?? {}
        for (const old_name of Object.keys(old_headers)){
            if (new_headers_lower.includes(old_name.toLowerCase())){
                delete old_headers[old_name]
            }
        }

        // Return response with new headers added
        callback({responseHeaders: {...old_headers, ...new_headers}})
    })

    // Save window position when closed
    window.on('close', () => {
        store.state.window_bounds = window.getNormalBounds()
        store.state.window_maximized = window.isMaximized()
        store.save()
    })

    return window
}

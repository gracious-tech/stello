
const fs = require('fs').promises
const fs_constants = require('fs').constants
const dns = require('dns').promises
const path = require('path')
const http = require('http')

const {app, BrowserWindow, ipcMain, shell, Menu, dialog} = require('electron')
const {autoUpdater} = require('electron-updater')
const context_menu = require('electron-context-menu')

const nodemailer = require('nodemailer')


// Don't open if another instance of Stello is already running
// NOTE The other instance will receive an event and focus itself instead
if (!app.requestSingleInstanceLock()){
    app.quit()
}


// Create HTTP server for receiving oauth2 redirects
const http_server_port = 44932
const http_server = http.createServer(async (request, response) => {

    const url = new URL(request.url, `http://127.0.0.1:${http_server_port}`)

    if (url.pathname === '/oauth' && app.isReady){
        // Process an oauth redirect (only possible if app is ready)
        const window = activate_app()  // Also brings window to front if not already
        window.webContents.send('oauth', url.toString())
        response.writeHead(303, {Location: '/'})  // Clear params to prevent replays
    } else {
        // Default route that simply prompts the user to close the window
        const template_path = path.join(__dirname, 'server_response.html')
        const template = await fs.readFile(template_path, {encoding: 'utf8'})
        response.write(template)
    }
    response.end()
})


// Start the server and close it when app closes
http_server.listen(http_server_port, '127.0.0.1')
app.on('quit', () => {
    http_server.close()
})


// Customise menu bar for macOS (since can't hide it as it's part of system bar)
// See https://www.electronjs.org/docs/api/menu
// See https://github.com/electron/electron/blob/master/lib/browser/default-menu.ts
if (process.platform === 'darwin'){
    Menu.setApplicationMenu(Menu.buildFromTemplate([
        // WARN Want to keep as much functionality within app as possible (so is cross-platform)
        //      So only include basics, so user doesn't go looking in menu for settings etc
        {
            label: app.name,
            submenu: [
                {role: 'about'},  // So can find out version even if app broken
                {role: 'toggleDevTools'},  // So can debug during production if needed
                {type: 'separator'},
                {role: 'quit'},  // So can quit whole app and not just close window
            ],
        },
        {role: 'editMenu'},  // Basic undo/clipboard stuff for those who don't know shortcuts
    ]))
}


// Enable context (right-click) menus
context_menu({
    showLookUpSelection: false,
    showSearchWithGoogle: false,
})


// App event handling

// Handle app init
app.whenReady().then(async () => {

    // Try to auto-update (if packaging format supports it)
    // NOTE Updates on Windows are currently handled by the Windows Store
    if (app.isPackaged && (process.platform === 'darwin' || process.env.APPIMAGE)){

        // Warn if app cannot overwrite itself (and .'. can't update)
        // NOTE If an AppImage, need to test the AppImage file rather than currently unpackaged code
        const app_path = process.env.APPIMAGE || app.getAppPath()
        let can_update = true
        try {
            await fs.access(app_path, fs_constants.W_OK)
        } catch {
            can_update = false
            let msg = `Stello is not able to auto-update because it doesn't have permission to write to itself. Please correct the permissions for:\n\n${app_path}`
            if (process.platform === 'darwin' && !app.isInApplicationsFolder()){
                // App is most likely running from a read-only mount of the DMG
                msg = "Please move Stello into your Applications folder and open it from there, otherwise you will not be able to receive important updates."
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
            }
        }

        // Check for updates if permissions ok
        if (can_update){
            autoUpdater.setFeedURL({
                provider: 'generic',
                url: 'https://releases.stello.news/electron/',
            })
            autoUpdater.checkForUpdatesAndNotify()
        }
    }

    // Open primary window for first time
    open_window()

    // Handle attempts to open another instance (e.g. via terminal etc)
    app.on('second-instance', () => {
        activate_app()
    })

    // Handle activation of app (e.g. clicking app in dock on Mac)
    app.on('activate', () => {
        activate_app()
    })
})

// Handle no-windows event
app.on('window-all-closed', () => {
    // End this process if no windows, unless Mac where it's normal to keep app in dock still
    if (process.platform !== 'darwin'){
        app.quit()
    }
})


// Helpers


function activate_app(){
    // Activate the app, ensuring it is open and focused, and only ever has one window
    let window = BrowserWindow.getAllWindows()[0]
    if (window){
        // Window already exists, so bring it to front and focus it
        if (window.isMinimized()){
            window.restore()
        }
        window.focus()
    } else {
        // No window yet so open one
        // NOTE Usually just for Macs where it's normal to keep app running despite window close
        window = open_window()
    }
    return window
}


function open_window(){
    // Create the browser window for the app
    const window = new BrowserWindow({
        width: 1000,
        height: 800,
        icon: path.join(__dirname, 'app_dist/_assets/branding/icon.png'),
        backgroundColor: '#000000',  // Avoid white flash before first paint
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false,  // TODO Remove when alternative for CORS issues implemented
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
        window.loadFile(path.join(__dirname, 'app_dist/index.html'))
    }
    load_index()

    // Ensure cannot navigate away from app and instead open all other URLs in system browser
    // NOTE Initial load and all in-app nav shouldn't trigger any of these events
    const handle_navigation = function(event, url){

        // Determine current file URL
        const current_file_url = window.webContents.getURL().split('#')[0]

        // Handle action
        if (url.startsWith(current_file_url)){
            // The only valid action for internal nav is to reload upon error
            // NOTE Reload file so nav to root in case displaying current page causes the error
            load_index()
        } else {
            shell.openExternal(url)
        }

        // Always prevent default otherwise could nav to an external url or create new windows
        event.preventDefault()
    }
    window.webContents.on('new-window', handle_navigation)  // e.g. _blank links
    window.webContents.on('will-navigate', handle_navigation)  // e.g. regular external links

    return window
}


function smtp_transport(settings){
    // Return an SMTP transport instance configured with provided settings
    const config = {
        host: settings.host,
        port: settings.port,
        auth: {
            user: settings.user,
            pass: settings.pass,
        },
        secure: !settings.starttls,
        requireTLS: true,  // Must use either TLS or STARTTLS (cannot be insecure)
        // Don't wait too long as may be testing invalid settings (defaults are in minutes!)
        connectionTimeout: 5 * 1000,  // ms
        greetingTimeout: 5 * 1000,  // ms
        socketTimeout: 5 * 1000,  // ms
        // Reuse same connection for multiple messages
        pool: true,
        maxConnections: 10,
    }

    // Send to localhost during development
    if (!app.isPackaged){
        config.host = 'localhost'
        config.port = 25
        config.secure = false
        config.requireTLS = false
        config.tls = {rejectUnauthorized: false}
    }

    return nodemailer.createTransport(config)
}


function normalize_nodemailer_error(error){
    // Normalize a nodemailer error to a cross-platform standard that app can understand
    // NOTE May be other codes, as only those raised during initial connection were accounted for
    let code = 'unknown'
    if (error.code === 'EDNS'){
        // Either DNS server couldn't find name, or had trouble communicating with DNS server
        code = error.message.startsWith('getaddrinfo ENOTFOUND') ? 'dns' : 'network'
    } else if (error.code === 'ESOCKET'){
        if (error.message.startsWith('Client network socket disconnected before secure TLS')){
            // Tried to use TLS on a STARTTLS port but aborted when server didn't support TLS
            code = 'starttls_required'
        } else {
            // Not connected (but cached DNS still knew ip)
            code = 'network'
        }
    } else if (error.code === 'ETIMEDOUT'){
        if (error.message === 'Greeting never received'){
            // Slow connection, or tried to use STARTTLS on a TLS port
            // NOTE If slow connection, probably wouldn't have gotten this far anyway, so assume tls
            code = 'tls_required'
        } else {
            // Wrong host, wrong port, or slow connection (may sometimes be a STARTTLS issue too)
            code = 'timeout'
        }
    } else if (error.code === 'EAUTH'){
        // Either username or password wrong (may need app password)
        code = 'auth'
    }
    // NOTE error.message already includes error.response (if it exists)
    return {code, details: `${error.code}: ${error.message}`}
}


function sleep(ms){
    // Await this function to delay execution for given ms
    return new Promise(resolve => setTimeout(resolve, ms))
}


// IPC handlers


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


ipcMain.handle('test_email_settings', async (event, settings, auth=true) => {
    // Tests provided settings to see if they work and returns either null or error string

    // Delay during dev so can test UI realisticly
    // NOTE During dev this will always succeed since settings are overriden with localhost
    if (!app.isPackaged){
        await sleep(1000)
    }

    let result = null
    const transport = smtp_transport(settings)
    try {
        await transport.verify()
    } catch (error){
        result = normalize_nodemailer_error(error)
        // If not testing auth, don't consider auth errors as failure
        if (!auth && result.code === 'auth'){
            result = null
        }
    }
    transport.close()
    return result
})


ipcMain.handle('send_emails', async (event, settings, emails, from, reply_to) => {
    // Send emails and return null for success, else error
    // NOTE Also emits email_submitted event for each individual email

    // Setup pooled transport
    const transport = smtp_transport(settings)

    // Request all be sent (without waiting) and let transport handle the queuing of requests
    // NOTE Using `Promise.all()` so can interrupt sending if any one hard fails
    return Promise.all(emails.map(async email => {
        const result = await transport.sendMail({
            from: from,
            to: email.to,
            subject: email.subject,
            html: email.html,
            replyTo: reply_to,
        })
        // Was submitted successfully, so immediately let renderer know
        // NOTE Also includes whether recipient address was accepted or not (a soft fail)
        event.sender.send('email_submitted', email.id, result.rejected.length === 0)
    })).then(() => {
        // Resolve with null for success (not array)
        return null
    }).catch(error => {
        // Resolve promise with normalized error
        return normalize_nodemailer_error(error)
    }).finally(() => {
        // Ensure transport always closed when done
        // NOTE If error was thrown then this will interrupt any still pending emails
        transport.close()
    })
})

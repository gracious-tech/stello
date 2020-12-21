
const path = require('path')
const nodemailer = require('nodemailer')
const {app, BrowserWindow, ipcMain, shell, Menu} = require('electron')
const {autoUpdater} = require('electron-updater')


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


// App event handling

// Handle app init
app.whenReady().then(() => {

    // Open the app in a new window
    open_app()

    // Handle future "opens" (when electron main already running)
    app.on('activate', () => {
        // If app window is not already open, open it now
        // NOTE Usually just for Macs where it's normal to keep app running despite window close
        if (BrowserWindow.getAllWindows().length === 0){
            open_app()
        }
    })

    // Auto-update (unless windows which relies on Windows Store for updates)
    if (process.platform !== 'win32'){
        autoUpdater.setFeedURL({
            provider: 'generic',
            url: 'https://releases.stello.news/electron/',
        })
        autoUpdater.checkForUpdatesAndNotify()
    }
})

// Handle no-windows event
app.on('window-all-closed', () => {
    // End this process if no windows, unless Mac where it's normal to keep app in dock still
    if (process.platform !== 'darwin'){
        app.quit()
    }
})


// Helpers


function open_app(){
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
    window.loadFile(path.join(__dirname, 'app_dist/index.html'))

    // Ensure cannot navigate away from app and instead open all other URLs in system browser
    // NOTE Initial load and all in-app nav shouldn't trigger any of these events
    const handle_navigation = function(event, url){
        // Allows reload of same file (e.g. when clicking recover button upon app failure)
        const current_file_url = window.webContents.getURL().split('#')[0]
        if (!url.startsWith(current_file_url)){
            event.preventDefault()
            shell.openExternal(url)
        }
    }
    window.webContents.on('new-window', handle_navigation)  // e.g. _blank links
    window.webContents.on('will-navigate', handle_navigation)  // e.g. regular external links
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
        secure: settings.port !== '587',  // Only init with plain-text (STARTTLS) if port is 587
        requireTLS: true,  // Must use either TLS or STARTTLS (cannot be insecure)
        // Don't keep user waiting (default is in minutes!)
        connectionTimeout: 3 * 1000, // ms
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


function sleep(ms){
    // Await this function to delay execution for given ms
    return new Promise(resolve => setTimeout(resolve, ms))
}


// IPC handlers


ipcMain.handle('test_email_settings', async (event, settings) => {
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
        result = error?.response || `${error.code}: ${error.message}`
    }
    transport.close()
    return result
})


ipcMain.handle('send_emails', async (event, settings, emails, from, no_reply) => {
    // Send emails and return array of null for success or otherwise error strings

    // Setup transport
    const transport = smtp_transport(settings)

    // Request all be sent and let transport handle the queuing of requests
    const reply_to = no_reply ? {name: "USE LINK TO REPLY", address: "noreply@localhost"} : null
    const requests = Promise.all(emails.map(async email => {
        try {
            await transport.sendMail({
                from: from,
                to: email.to,
                subject: email.subject,
                html: email.html,
                replyTo: reply_to,
            })
        } catch (error){
            return error?.response || `${error.code}: ${error.message}`
        }
        return null
    }))

    // Close the connection when all done (since using pool)
    requests.finally(() => transport.close())

    // Return results
    return requests
})

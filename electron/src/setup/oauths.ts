
import http from 'http'
import {URL} from 'url'  // See https://github.com/DefinitelyTyped/DefinitelyTyped/issues/34960
import {readFileSync} from 'fs'

import {app} from 'electron'

import {get_path} from '../utils/config'
import {activate_app} from '../utils/window'


// Load oauth html
const oauth_html = readFileSync(get_path('assets/server_response.html'), {encoding: 'utf8'})

// Load youtube html
// NOTE Youtube proxy piggybacks off oauth server so don't need to run two and waste memory
const youtube_html = readFileSync(get_path('assets/youtube_proxy.html'), {encoding: 'utf8'})


// Create HTTP server for receiving oauth2 redirects
const http_server_port = app.isPackaged ? 44932 : 44933
const http_server = http.createServer(async (request, response) => {

    const url = new URL(request.url ?? '', `http://127.0.0.1:${http_server_port}`)

    if (url.pathname === '/youtube'){
        response.write(youtube_html)
    } else if (url.pathname === '/oauth' && app.isReady()){
        // Process an oauth redirect (only possible if app is ready)
        const window = await activate_app()  // Also brings window to front if not already
        window.webContents.send('oauth', url.toString())
        response.writeHead(303, {Location: '/'})  // Clear params to prevent replays
    } else {
        // Default route that simply prompts the user to close the window
        response.write(oauth_html)
    }
    response.end()
})


// Start the server and close it when app closes
// TODO Better handling of port-taken errors (currently throws async without stopping app)
http_server.listen(http_server_port, '127.0.0.1')
app.on('quit', () => {
    http_server.close()
})


import {app, ipcMain} from 'electron'
import nodemailer from 'nodemailer'

import {sleep} from '../utils/async'
import {Email, EmailSettings, EmailError} from '../native_types'


interface SmtpSettings {
    host:string
    port:number
    user:string
    pass:string
    starttls:boolean
}


// Some hosts seem to intentionally respond slowly to prevent spam
// Too slow to apply to all hosts, so just wait for hardcoded ones
const SLOW_HOSTS = ['.cotse.net']


const SMTP_TRANSPORTS:Record<string, ReturnType<typeof smtp_transport>> = {}


function transport_id_from_settings(settings:EmailSettings):string{
    // Generate transport id from settings
    return JSON.stringify(
        [settings.host, settings.port, settings.starttls, settings.user, settings.pass])
}


function smtp_transport(settings:SmtpSettings){
    // Return an SMTP transport instance configured with provided settings

    // If host is own device (e.g. ProtonMail's bridge) TLS won't be required
    // SECURITY Assumes user's device is secure, otherwise would be bigger problems anyway
    const localhost = settings.host === '127.0.0.1' || settings.host === 'localhost'

    const config = {
        host: settings.host,
        port: settings.port,
        auth: {
            user: settings.user,
            pass: settings.pass,
        },
        secure: !settings.starttls,
        requireTLS: !localhost,  // Must use either TLS or STARTTLS (cannot be insecure)
        // Don't wait too long as may be testing invalid settings (defaults are in minutes!)
        // If can't connect promptly then must be wrong name/port
        connectionTimeout: (SLOW_HOSTS.some(h => settings.host.endsWith(h)) ? 30 : 8) * 1000,
        greetingTimeout: 10 * 1000,  // Greeting should come quickly, within 5, but allow 10 in case
        // Some servers are slow to reply to auth for security (like smtp.bigpond.com's 10 secs)
        socketTimeout: 30 * 1000,  // Allow 30 secs for responses / new sends
        // Reuse same connection for multiple messages
        pool: true,
        maxMessages: Infinity,  // No reason to start new connection after x messages
        // PSMail's limit is 10, others probably similar, so stay well below
        maxConnections: 6,  // NOTE Update email.ts if this changes
        // Log during dev
        logger: !app.isPackaged,
        debug: !app.isPackaged,
        tls: {
            rejectUnauthorized: !localhost,  // ProtonMail Bridge uses self-signed cert
        },
    }

    // Send to localhost during development
    if (!app.isPackaged && process.env['STELLO_SMTP_LOCALHOST'] !== "false"){
        config.host = 'localhost'
        config.port = 25
        config.secure = false
        config.requireTLS = false
        config.tls = {rejectUnauthorized: false}
    }

    return nodemailer.createTransport(config)
}


interface NodeMailerError {
    // See https://github.com/nodemailer/nodemailer/blob/master/lib/smtp-connection/index.js
    message?:string  // Unlike regular error objects this can actually be undefined at times!
    code?:string
    response?:string
    responseCode?:number
    command?:string
}


function normalize_nodemailer_error(error:unknown):EmailError{
    // Normalize a nodemailer error to a cross-platform standard that app can understand
    // NOTE May be other codes, as only those raised during initial connection were accounted for

    // Ensure error is an object
    if (typeof error !== 'object' || error === null){
        return {code: 'unknown', details: `${error as string}`}
    }

    // Map nodemailer codes to app codes
    const error_obj = error as NodeMailerError
    let code:EmailError['code'] = 'unknown'

    // Determine if a tmp error regardless of protocol stage (may succeed if retried in future)
    /* NOTE Some servers use a permanent error code for tmp throttling :/
        EMESSAGE 554 5.0.0
            Error: transaction failed, blame it on the weather: Sending limit has been reached!
            ProtonMail is not for bulk emailing or spamming. Please try again in a few hours.
        EENVELOPE 552 5.7.1
            Data command rejected: Already reached per-10 minute limit for messages sent from
            "...@fastmail.com" of 2000, try again later"
    */
    const is_tmp_error = (typeof error_obj.responseCode === 'number'
        && error_obj.responseCode >= 400 && error_obj.responseCode < 500)
        || error_obj.message?.toLowerCase().includes(' limit')

    if (error_obj.code === 'EDNS'){
        // Either DNS server couldn't find name, or had trouble communicating with DNS server
        code = error_obj.message?.startsWith('getaddrinfo ENOTFOUND') ? 'dns' : 'network'
    } else if (error_obj.code === 'EPROTOCOL'){
        // Server responds in a non-SMTP way (e.g. user gave an IMAP port by mistake)
        code = 'port'
    } else if (error_obj.code === 'ESOCKET'){
        if (error_obj.message?.startsWith('Client network socket disconnected before secure TLS')){
            // Tried to use TLS on a STARTTLS port but aborted when server didn't support TLS
            code = 'starttls_required'
        } else {
            // Not connected (but cached DNS still knew ip)
            code = 'network'
        }
    } else if (error_obj.code === 'ETIMEDOUT'){
        if (error_obj.message === 'Greeting never received'){
            // Slow connection, or tried to use STARTTLS on a TLS port
            // NOTE If slow connection, probably wouldn't have gotten this far anyway, so assume tls
            code = 'tls_required'
        } else {
            // Wrong host, wrong port, or slow connection (may sometimes be a STARTTLS issue too)
            code = 'timeout'
        }
    } else if (error_obj.code === 'EAUTH'){
        // Either username or password wrong (may need app password)
        code = 'auth'
    } else if (error_obj.code === 'EENVELOPE'){
        // Server didn't accept the actual message
        if (is_tmp_error){
            // 4xx errors are usually temporary server-side issues
            code = 'throttled'
        } else {
            // Other errors (5xx) are poorly defined, so must guess from text response
            const response = error_obj.response?.toLowerCase() ?? ''
            if (response.includes('recipient')){
                // Assume has something to do with the recipient address being invalid
                code = 'invalid_to'
            }
        }
    } else if (error_obj.code === 'EMESSAGE'){
        // Something went wrong when actually processing the message (?)
        if (is_tmp_error){
            // Servers may drop messages if they literally can't handle too many at once
            // e.g. "451 4.3.0 acf-proxy: Error: queue file write error"
            code = 'throttled'
        }
    }

    // NOTE error_obj.message already includes error_obj.response (if it exists)
    return {code, details: `${error_obj.code ?? ''}: ${error_obj.message ?? ''}`}
}


function dev_throwing(){
    // Randomly throw fake errors during dev
    // WARN Do not make async as can mess up SMTP_TRANSPORTS values if they get deleted/recreated

    if (app.isPackaged || process.env['STELLO_SMTP_LOCALHOST'] === "false"){
        return
    }

    // Randomly throw exceptions
    const random = Math.random()
    if (random > 0.9){
        // Invalid to address
        throw {
            code: 'EENVELOPE',
            responseCode: 550,
            response: "Can't send mail - all recipients were rejected: 550 5.1.2 <address>:"
                + " Recipient address rejected: Domain not found",
        } as NodeMailerError
    } else if (random > 0.8){
        // Throttled
        throw {
            code: 'EENVELOPE',
            responseCode: 450,
        } as NodeMailerError
    }
}


// IPC handlers


ipcMain.handle('test_email_settings', async (event, settings:EmailSettings, auth=true) => {
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
        console.error(error)
        result = normalize_nodemailer_error(error)
        // If not testing auth, don't consider auth errors as failure
        if (!auth && result.code === 'auth'){
            result = null
        }
    }
    transport.close()
    return result
})


ipcMain.handle('smtp_send', async (
    event, settings:EmailSettings, email:Email):Promise<EmailError|null> => {
    // Send email and return null for success, else error
    // NOTE nodemailer auto includes standard headers (including Message-ID)
    // NOTE Since no alternate plain text, get slight spam rating but too little to worry about
    //      "0.1 BODY: Message only has text/html MIME parts"

    // Simulate network delay during development (between 0-2 secs)
    if (!app.isPackaged){
        await sleep(2000 * Math.random())
    }

    // Generate transport id from settings
    const transport_id = transport_id_from_settings(settings)

    // Init or reuse transport
    if (! (transport_id in SMTP_TRANSPORTS)){
        SMTP_TRANSPORTS[transport_id] = smtp_transport(settings)
    }

    // Try to send the email (will throw if a hard fail)
    try {
        dev_throwing()
        const result = await SMTP_TRANSPORTS[transport_id]!.sendMail({
            from: email.from,
            to: email.to,
            subject: email.subject,
            html: email.html,
            replyTo: email.reply_to,
        })
        return result.rejected.length === 0 ? null : {code: 'invalid_to', details: ''}
    } catch (error){
        return normalize_nodemailer_error(error)
    }
})

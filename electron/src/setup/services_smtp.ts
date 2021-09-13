
import {app, ipcMain} from 'electron'
import nodemailer, {Transporter} from 'nodemailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import {sleep} from '../utils/async'
import {Email, EmailSettings, EmailError} from '../native_types'


interface SmtpSettings {
    host:string
    port:number
    user:string
    pass:string
    starttls:boolean
}


function smtp_transport(settings:SmtpSettings){
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
        connectionTimeout: 5 * 1000,  // If can't connect in 5 secs then must be wrong name/port
        greetingTimeout: 5 * 1000,  // Greeting should come quickly so allow 5 secs
        // Some servers are slow to reply to auth for security (like smtp.bigpond.com's 10 secs)
        socketTimeout: 30 * 1000,  // Allow 30 secs for responses
        // Reuse same connection for multiple messages
        pool: true,
        maxMessages: Infinity,  // No reason to start new connection after x messages
        maxConnections: 10,  // Choose largest servers will allow (but if only ~100 msgs, 5-10 fine)
        // Log during dev
        logger: !app.isPackaged,
        debug: !app.isPackaged,
        tls: {},
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


interface NodeMailerError extends Error {
    // See https://github.com/nodemailer/nodemailer/blob/master/lib/smtp-connection/index.js
    message:string
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
    if (error_obj.code === 'EDNS'){
        // Either DNS server couldn't find name, or had trouble communicating with DNS server
        code = error_obj.message?.startsWith('getaddrinfo ENOTFOUND') ? 'dns' : 'network'
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
        if (error_obj.responseCode && error_obj.responseCode >= 400
                && error_obj.responseCode < 500){
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
    }
    // NOTE error_obj.message already includes error_obj.response (if it exists)
    return {code, details: `${error_obj.code ?? ''}: ${error_obj.message}`}
}


// IPC handlers




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


ipcMain.handle('send_emails', async (event, settings:EmailSettings, emails:Email[]) => {
    // Send emails and return null for success, else error
    // NOTE Also emits `email_submitted` event for each individual emails that don't hard fail

    // Helper for sending an email and reporting success
    const send_email = async(transport:Transporter<SMTPTransport.SentMessageInfo>, email:Email) => {

        // Try to send the email (will throw if a hard fail)
        const result = await transport.sendMail({
            from: email.from,
            to: email.to,
            subject: email.subject,
            html: email.html,
            replyTo: email.reply_to,
        })

        // Was submitted, so immediately let renderer know
        // NOTE Also includes whether recipient address was accepted or not (a soft fail)
        event.sender.send('email_submitted', email.id, result.rejected.length === 0)
    }

    // Initial parallel sending attempt
    // NOTE Rate limiting very common (especially for gmail), but no way to know unless first try
    // NOTE This instantly submits all emails to nodemailer which handles the parallel queuing
    let transport = smtp_transport(settings)
    const unsent = (await Promise.all(emails.map(async email => {
        try {
            await send_email(transport, email)
        } catch {
            // Close transport to interrupt remaining sends so can switch to synchronous sending
            transport.close()
            // Return email if failed to send
            return email
        }
        return null  // Null return means email was submitted successfully
    }))).filter(email => email) as Email[]  // Filter out nulls (successes)

    // If nothing in unsent array, then all done
    if (!unsent.length){
        return null
    }

    // Retry sending of failed emails, this time sequentially, with a delay between each if needed
    transport = smtp_transport(settings)  // Old transport already closed
    for (const email of unsent){
        try {
            await send_email(transport, email)
        } catch {
            // If didn't work, try waiting a bit before next attempt
            await sleep(5)
            try {
                await send_email(transport, email)
            } catch (error){
                // If didn't work after waiting, problem not resolvable...
                transport.close()
                return normalize_nodemailer_error(error)
            }
        }
    }

    // All submitted successfully
    transport.close()
    return null
})

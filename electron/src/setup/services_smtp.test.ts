
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {app, invoke} from '../electron.test_utils'

import type {Email, EmailSettings} from '../native_types.js'


vi.mock('electron', () => import('../electron.test_utils'))
vi.mock('../utils/async.js', () => ({sleep: vi.fn(async () => undefined)}))


// Mock nodemailer transports (tests set the next result of verify/sendMail via hooks)
const mailer = vi.hoisted(() => ({
    transports: [] as {config:Record<string, unknown>, close:()=>void}[],
    sends: [] as unknown[],
    verify_error: null as unknown,
    send_error: null as unknown,
    send_result: {rejected: [] as string[]},
}))
vi.mock('nodemailer', () => ({default: {createTransport: (config:Record<string, unknown>) => {
    const transport = {
        config,
        close: vi.fn(),
        verify: async () => {
            if (mailer.verify_error !== null){
                throw mailer.verify_error
            }
            return true
        },
        sendMail: async (options:unknown) => {
            mailer.sends.push(options)
            if (mailer.send_error !== null){
                throw mailer.send_error
            }
            return mailer.send_result
        },
    }
    mailer.transports.push(transport)
    return transport
}}}))


// Settings are unique per test since the module caches transports by settings
let settings:EmailSettings

const email:Email = {
    id: 'email1',
    from: {name: 'A', address: 'a@example.com'},
    to: {name: 'B', address: 'b@example.com'},
    subject: 'Subject',
    html: '<p>Hi</p>',
    reply_to: {name: 'R', address: 'r@example.com'},
}


// Import once (registers handlers) and default to packaged to avoid dev behaviour
beforeEach(async () => {
    vi.clearAllMocks()
    mailer.transports.length = 0
    mailer.sends.length = 0
    mailer.verify_error = null
    mailer.send_error = null
    mailer.send_result = {rejected: []}
    settings = {host: 'smtp.example.com', port: 465, starttls: false, user: `u${Math.random()}`,
        pass: 'pass'}
    app.isPackaged = true
    await import('./services_smtp.js')
})
afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
})


describe('test_email_settings', () => {

    // Successful verify returns null and closes transport
    test('success', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        expect(await invoke('test_email_settings', settings)).toBe(null)
        const transport = mailer.transports[0]!
        expect(transport.close).toHaveBeenCalled()
        expect(transport.config).toMatchObject({
            host: 'smtp.example.com',
            port: 465,
            secure: true,
            requireTLS: true,
            connectionTimeout: 8000,
            pool: true,
            logger: false,
            tls: {rejectUnauthorized: true},
        })
    })

    // Errors are normalized
    test('failure returns normalized error', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        mailer.verify_error = {code: 'EAUTH', message: 'bad'}
        expect(await invoke('test_email_settings', settings))
            .toEqual({code: 'auth', details: 'EAUTH: bad'})
    })

    // Auth errors ignored if not testing auth
    test('auth errors ignored when auth=false', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        mailer.verify_error = {code: 'EAUTH', message: 'bad'}
        expect(await invoke('test_email_settings', settings, false)).toBe(null)
        mailer.verify_error = {code: 'ETIMEDOUT', message: 'x'}
        expect(await invoke('test_email_settings', settings, false))
            .toEqual({code: 'timeout', details: 'ETIMEDOUT: x'})
    })

    // STARTTLS, localhost and slow hosts change config
    test('transport config variations', async () => {
        await invoke('test_email_settings', {...settings, host: '127.0.0.1', starttls: true})
        expect(mailer.transports[0]!.config).toMatchObject({
            secure: false, requireTLS: false, tls: {rejectUnauthorized: false}})
        await invoke('test_email_settings', {...settings, host: 'mail.cotse.net'})
        expect(mailer.transports[1]!.config['connectionTimeout']).toBe(30000)
    })

    // Dev mode redirects to localhost (unless disabled)
    test('dev mode uses localhost', async () => {
        app.isPackaged = false
        await invoke('test_email_settings', settings)
        expect(mailer.transports[0]!.config).toMatchObject({
            host: 'localhost', port: 25, secure: false, requireTLS: false, logger: true})
        vi.stubEnv('STELLO_SMTP_LOCALHOST', 'false')
        await invoke('test_email_settings', settings)
        expect(mailer.transports[1]!.config['host']).toBe('smtp.example.com')
    })
})


describe('smtp_send', () => {

    // Sends with mapped fields and reuses transport
    test('sends and reuses transport', async () => {
        expect(await invoke('smtp_send', settings, email)).toBe(null)
        expect(await invoke('smtp_send', settings, email)).toBe(null)
        expect(mailer.transports).toHaveLength(1)
        expect(mailer.sends[0]).toEqual({
            from: email.from, to: email.to, subject: email.subject, html: email.html,
            replyTo: email.reply_to,
        })
        await invoke('smtp_send', {...settings, pass: 'other'}, email)
        expect(mailer.transports).toHaveLength(2)
    })

    // Rejected recipients reported
    test('rejected recipient', async () => {
        mailer.send_result = {rejected: ['b@example.com']}
        expect(await invoke('smtp_send', settings, email))
            .toEqual({code: 'invalid_to', details: ''})
    })

    async function send_error(error:unknown){
        // Send with sendMail throwing the given error
        mailer.send_error = error
        return await invoke('smtp_send', settings, email) as {code:string, details:string}
    }

    // Each nodemailer error maps to an app code
    test.each([
        [{code: 'EDNS', message: 'getaddrinfo ENOTFOUND x'}, 'dns'],
        [{code: 'EDNS', message: 'queryA ETIMEOUT'}, 'network'],
        [{code: 'EPROTOCOL', message: 'x'}, 'port'],
        [{code: 'ESOCKET', message: 'Client network socket disconnected before secure TLS ...'},
            'starttls_required'],
        [{code: 'ESOCKET', message: 'ECONNRESET'}, 'network'],
        [{code: 'ETIMEDOUT', message: 'Greeting never received'}, 'tls_required'],
        [{code: 'ETIMEDOUT', message: 'Connection timeout'}, 'timeout'],
        [{code: 'EAUTH', message: 'x'}, 'auth'],
        [{code: 'EENVELOPE', responseCode: 450, message: 'x'}, 'throttled'],
        [{code: 'EENVELOPE', responseCode: 552, message: 'Already reached per-10 minute limit'},
            'throttled'],
        [{code: 'EENVELOPE', responseCode: 550, response: '550 Recipient address rejected'},
            'invalid_to'],
        [{code: 'EENVELOPE', responseCode: 550, response: '550 Something else'}, 'unknown'],
        [{code: 'EENVELOPE', responseCode: 550}, 'unknown'],
        [{code: 'EMESSAGE', responseCode: 451, message: 'queue file write error'}, 'throttled'],
        [{code: 'EMESSAGE', responseCode: 554, message: 'Sending limit has been reached'},
            'throttled'],
        [{code: 'EMESSAGE', responseCode: 554, message: 'rejected'}, 'unknown'],
        [{code: 'EOTHER'}, 'unknown'],
    ])('error %o -> %s', async (error, code) => {
        expect((await send_error(error)).code).toBe(code)
    })

    // Non-object errors still handled
    test('non-object error', async () => {
        expect(await send_error('boom')).toEqual({code: 'unknown', details: 'boom'})
        expect(await send_error(undefined)).toEqual({code: 'unknown', details: 'undefined'})
    })

    // Details include code and message, tolerating missing ones
    test('details', async () => {
        expect((await send_error({code: 'EAUTH', message: 'Invalid login'})).details)
            .toBe('EAUTH: Invalid login')
        expect((await send_error({})).details).toBe(': ')
    })

    // Dev mode randomly throws fake errors
    test('dev mode fake errors', async () => {
        app.isPackaged = false
        const random = vi.spyOn(Math, 'random')
        random.mockReturnValue(0.95)
        expect((await invoke('smtp_send', settings, email) as {code:string}).code)
            .toBe('invalid_to')
        random.mockReturnValue(0.85)
        expect((await invoke('smtp_send', settings, email) as {code:string}).code)
            .toBe('throttled')
        random.mockReturnValue(0.1)
        expect(await invoke('smtp_send', settings, email)).toBe(null)
    })
})


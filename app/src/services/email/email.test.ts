
// Tests for email queue/throttling and the individual transports

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {setup_globals, json_response} from '@/../tests/unit_utils'
import {new_email_task, QueueItem} from './email'
import {send_batch_smtp} from './smtp'
import {send_batch_google} from './google'
import {send_batch_microsoft} from './microsoft'
import {create_email, BadEmailAddress} from './utils'
import {encode_contact, encode_subject} from './mime'
import * as smtp from './smtp'
import * as oauth_module from '../tasks/oauth'
import {TaskAborted} from '../tasks/tasks'
import {MustInterpret, MustReauthenticate, MustReconfigure, MustReconnect, MustWait}
    from '../utils/exceptions'
import {OAuth} from '../database/oauths'
import {base64_to_buffer, utf8_to_string} from '../utils/coding'
import type {Email} from '../native/types'
import type {Profile} from '../database/profiles'


beforeEach(async () => {
    await setup_globals()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'debug').mockImplementation(() => undefined)
})

afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
})


// Helpers
let settings_counter = 0
function new_settings(oauth:string|null=null):Profile['smtp_settings']{
    // Unique settings so each test gets its own account manager
    return {oauth, host: 'h', port: settings_counter++, starttls: false, user: 'u', pass: 'p'}
}
function email(id:string, to='to@x.com'):Email{
    return {id, to: {name: 'To', address: to}, from: {name: 'From', address: 'from@x.com'},
        subject: 'Subject', html: '<p>Hi</p>'}
}
function item(id:string):QueueItem{
    return {email: email(id), task_id: 't', resolve: () => undefined, reject: () => undefined}
}
const fake_oauth = (issuer:'google'|'microsoft') => new OAuth({issuer} as OAuth)


describe('email account manager', () => {

    test('sends via smtp and resolves with success', async () => {
        const spy = vi.spyOn(smtp, 'send_batch_smtp').mockImplementation(
            async items => items.map(i => [i, null]))
        const task = new_email_task(new_settings())
        expect(await task.send(email('1'))).toBe(true)
        expect(spy).toHaveBeenCalledTimes(1)
    })

    test('bad address resolves false without killing transport', async () => {
        vi.spyOn(smtp, 'send_batch_smtp').mockImplementation(
            async items => items.map(i => [i, new BadEmailAddress()]))
        const task = new_email_task(new_settings())
        expect(await task.send(email('1'))).toBe(false)
        expect(await task.send(email('2'))).toBe(false)
    })

    test('fatal error rejects all queued and future sends with same error', async () => {
        const error = new MustReauthenticate()
        vi.spyOn(smtp, 'send_batch_smtp').mockImplementation(async items => {
            await new Promise(r => setTimeout(r, 5))
            return items.map(i => [i, error])
        })
        const settings = new_settings()
        const task = new_email_task(settings)
        const results = await Promise.allSettled([...Array(10).keys()].map(
            i => task.send(email(String(i)))))
        expect(results.every(r => r.status === 'rejected' && r.reason === error)).toBe(true)
        await expect(task.send(email('late'))).rejects.toBe(error)
        // A new task with same settings gets a fresh manager since old one is dead
        vi.spyOn(smtp, 'send_batch_smtp').mockImplementation(
            async items => items.map(i => [i, null]))
        expect(await new_email_task(settings).send(email('new'))).toBe(true)
    })

    test('throttling retries with interval and single processor', async () => {
        // First retry after throttling must also wait for the interval
        let calls = 0
        vi.spyOn(smtp, 'send_batch_smtp').mockImplementation(async items => {
            calls++
            return items.map(i => [i, calls === 1 ? new MustWait() : null])
        })
        const task = new_email_task(new_settings())
        const start = Date.now()
        expect(await task.send(email('1'))).toBe(true)
        expect(calls).toBe(2)
        expect(Date.now() - start).toBeGreaterThanOrEqual(900)  // Waited ~1s interval
    })

    test('abort rejects queued emails and prevents further queuing', async () => {
        vi.spyOn(smtp, 'send_batch_smtp').mockImplementation(async items => {
            await new Promise(r => setTimeout(r, 20))
            return items.map(i => [i, null])
        })
        const task = new_email_task(new_settings())
        const sends = [...Array(8).keys()].map(i => task.send(email(String(i))))
        task.abort()
        const results = await Promise.allSettled(sends)
        // 6 smtp processors already sending, remaining 2 queued and so aborted
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(6)
        expect(results.filter(r => r.status === 'rejected'
            && r.reason instanceof TaskAborted)).toHaveLength(2)
        await expect(task.send(email('x'))).rejects.toBeInstanceOf(TaskAborted)
    })

    test('aborted task items being retried are rejected', async () => {
        let calls = 0
        let task!:ReturnType<typeof new_email_task>
        vi.spyOn(smtp, 'send_batch_smtp').mockImplementation(async items => {
            calls++
            if (calls === 1){
                task.abort()  // Abort while first is sending, then report throttled
            }
            return items.map(i => [i, new MustWait()])
        })
        task = new_email_task(new_settings())
        await expect(task.send(email('1'))).rejects.toBeInstanceOf(TaskAborted)
    })

    test('unconfigured settings reject with MustReconfigure', async () => {
        const task = new_email_task({...new_settings(), pass: ''})
        await expect(task.send(email('1'))).rejects.toBeInstanceOf(MustReconfigure)
    })

    test('oauth settings use issuer specific transport', async () => {
        const oauth = await self.app_db.oauths.create({issuer: 'google', issuer_id: 'g'} as OAuth)
        const google = vi.spyOn(await import('./google'), 'send_batch_google')
            .mockImplementation(async items => items.map(i => [i, null]))
        expect(await new_email_task(new_settings(oauth.id)).send(email('1'))).toBe(true)
        expect(google).toHaveBeenCalledTimes(1)

        const ms_oauth = await self.app_db.oauths.create(
            {issuer: 'microsoft', issuer_id: 'm'} as OAuth)
        const ms = vi.spyOn(await import('./microsoft'), 'send_batch_microsoft')
            .mockImplementation(async items => items.map(i => [i, null]))
        expect(await new_email_task(new_settings(ms_oauth.id)).send(email('1'))).toBe(true)
        expect(ms).toHaveBeenCalledTimes(1)

        await expect(new_email_task(new_settings('deleted')).send(email('1')))
            .rejects.toBeInstanceOf(MustReconfigure)
    })
})


describe('smtp transport', () => {

    test('maps native error codes to errors', async () => {
        const codes = [null, 'invalid_to', 'throttled', 'auth', 'network', 'dns', 'port',
            'starttls_required', 'tls_required', 'timeout', 'unknown'] as const
        const expected = [null, BadEmailAddress, MustWait, MustReauthenticate, MustReconnect,
            MustReconfigure, MustReconfigure, MustReconfigure, MustReconfigure, MustReconfigure,
            MustInterpret]
        for (let i = 0; i < codes.length; i++){
            const code = codes[i]!
            self.app_native.smtp_send = async () => code ? {code, details: ''} : null
            const [[, error]] = await send_batch_smtp([item('1')],
                {host: '', port: 1, starttls: false, user: '', pass: ''}) as [[QueueItem, unknown]]
            if (expected[i] === null){
                expect(error).toBe(null)
            } else {
                expect(error).toBeInstanceOf(expected[i])
            }
        }
    })
})


describe('google transport', () => {

    // Mock the oauth request to return given response
    function mock_resp(status:number, body?:unknown){
        return vi.spyOn(oauth_module, 'oauth_request').mockResolvedValue(
            body === undefined ? new Response('', {status}) : json_response(body, status))
    }

    test('sends raw rfc822 email', async () => {
        const spy = mock_resp(200, {})
        const [[, error]] = await send_batch_google([item('1')], fake_oauth('google'))
        expect(error).toBe(null)
        const body = spy.mock.calls[0]![4] as Blob
        expect(body.type).toBe('message/rfc822')
        expect(await body.text()).toContain('Subject: Subject')
    })

    test('only supports single item batches', async () => {
        await expect(send_batch_google([item('1'), item('2')], fake_oauth('google')))
            .rejects.toThrow('exactly one item')
    })

    test('interprets error responses', async () => {
        const cases:[number, unknown, unknown][] = [
            [400, {error: {status: 'FAILED_PRECONDITION'}}, oauth_module.OauthUseless],
            [400, {error: {message: 'Invalid To header'}}, BadEmailAddress],
            [401, undefined, MustReauthenticate],
            [403, {error: {errors: [{reason: 'domainPolicy'}]}}, oauth_module.OauthUseless],
            [403, {error: {errors: [{reason: 'userRateLimitExceeded'}]}}, MustWait],
            [403, {}, MustReauthenticate],
            [429, undefined, MustWait],
            [503, undefined, MustWait],
            [400, {}, MustInterpret],
            [418, 'not an object', MustInterpret],
        ]
        for (const [status, body, error_class] of cases){
            mock_resp(status, body)
            const [[, error]] = await send_batch_google([item('1')], fake_oauth('google'))
            expect(error, `status ${status}`).toBeInstanceOf(error_class)
        }
    })
})


describe('microsoft transport', () => {

    test('sends batch and maps sub-responses', async () => {
        const items = ['ok', 'bad', 'auth', 'throttle403', 'forbidden', 'throttle', 'server',
            'other'].map(item)
        const spy = vi.spyOn(oauth_module, 'oauth_request').mockResolvedValue(json_response({
            responses: [
                {id: 'ok', status: 202},
                {id: 'bad', status: 400, body: {error: {code: 'ErrorInvalidRecipients'}}},
                {id: 'auth', status: 401},
                {id: 'throttle403', status: 403, body: {error:
                    {code: 'ErrorMessageTransientError'}}},
                {id: 'forbidden', status: 403},
                {id: 'throttle', status: 429},
                {id: 'server', status: 503},
                {id: 'other', status: 418},
            ],
        }))
        const results = await send_batch_microsoft([...items, item('missing')],
            fake_oauth('microsoft'))
        const errors = results.map(([, error]) => error)
        expect(errors[0]).toBe(null)
        expect(errors[1]).toBeInstanceOf(BadEmailAddress)
        expect(errors[2]).toBeInstanceOf(MustReauthenticate)
        expect(errors[3]).toBeInstanceOf(MustWait)
        expect(errors[4]).toBeInstanceOf(MustReauthenticate)
        expect(errors[5]).toBeInstanceOf(MustWait)
        expect(errors[6]).toBeInstanceOf(MustWait)
        expect(errors[7]).toBeInstanceOf(MustInterpret)
        expect((errors[8] as Error).message).toContain('Missing result')
        const body = spy.mock.calls[0]![4] as {requests:{body:{message:{replyTo:unknown}}}[]}
        expect(body.requests).toHaveLength(9)
        expect(body.requests[0]!.body.message.replyTo).toBeUndefined()
    })

    test('batch level errors', async () => {
        vi.spyOn(oauth_module, 'oauth_request').mockResolvedValue(json_response({}, 503))
        await expect(send_batch_microsoft([item('1')], fake_oauth('microsoft')))
            .rejects.toBeInstanceOf(MustWait)
        vi.spyOn(oauth_module, 'oauth_request').mockResolvedValue(json_response({}, 400))
        await expect(send_batch_microsoft([item('1')], fake_oauth('microsoft')))
            .rejects.toBeInstanceOf(MustInterpret)
    })
})


describe('mime encoding', () => {

    test('encode_contact quotes or encodes names as needed', () => {
        expect(encode_contact({name: 'Bob Smith', address: 'b@x'})).toBe('Bob Smith <b@x>')
        expect(encode_contact({name: 'Smith, Bob', address: 'b@x'})).toBe('"Smith, Bob" <b@x>')
        expect(encode_contact({name: 'Bob "B"', address: 'b@x'})).toBe('"Bob \\"B\\"" <b@x>')
        expect(encode_contact({name: 'Zoë', address: 'z@x'})).toBe('=?UTF-8?Q?Zo=C3=AB?= <z@x>')
    })

    test('encode_subject leaves ascii and encodes unicode', () => {
        expect(encode_subject('Hello world')).toBe('Hello world')
        const encoded = encode_subject('Café news ✓')
        expect(encoded).toMatch(/^=\?UTF-8\?Q\?.+\?=$/)
        expect(encoded).toContain('Caf=C3=A9_news')
    })

    test('whitespace control chars are escaped within encoded words', () => {
        const encoded = encode_subject('Café\tnews\r\nend ')
        expect(encoded).toContain('Caf=C3=A9=09news=0D=0Aend=20')
        expect(encoded).not.toMatch(/[\t\r\n]/)
    })

    test('long unicode subjects split into multiple encoded words', () => {
        const encoded = encode_subject('é'.repeat(60))
        const words = encoded.split(' ')
        expect(words.length).toBeGreaterThan(1)
        for (const word of words){
            expect(word.length).toBeLessThanOrEqual(75)  // RFC 2047 encoded-word limit
        }
    })
})


describe('create_email', () => {

    test('produces rfc headers and html body', () => {
        const raw = utf8_to_string(create_email({name: 'From', address: 'f@x'},
            {name: 'To', address: 't@x'}, 'Subject', '<p>Body ✓</p>',
            {name: 'Reply', address: 'r@x'}))
        const [headers, body] = raw.split('\r\n\r\n') as [string, string]
        expect(headers.split('\r\n')).toEqual([
            'From: From <f@x>',
            'To: To <t@x>',
            'Subject: Subject',
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            'Reply-To: Reply <r@x>',
        ])
        expect(utf8_to_string(base64_to_buffer(body.replaceAll('\r\n', ''))))
            .toBe('<p>Body ✓</p>')
    })

    test('includes MIME-Version header', () => {
        const raw = utf8_to_string(create_email({name: '', address: 'f@x'},
            {name: '', address: 't@x'}, 'S', 'body'))
        expect(raw).toContain('MIME-Version: 1.0')
    })

    test('no line exceeds the RFC 5322 limit of 998 chars', () => {
        const raw = utf8_to_string(create_email({name: '', address: 'f@x'},
            {name: '', address: 't@x'}, 'S', `<p>${'word '.repeat(400)}</p>`))
        for (const line of raw.split('\r\n')){
            expect(line.length).toBeLessThanOrEqual(998)
        }
    })

    test('long multi-byte bodies decode exactly', () => {
        // Chunks split multi-byte chars across lines, which must still decode correctly
        const html = `<p>${'Grüße ✓ 你好 '.repeat(5000)}</p>`
        const raw = utf8_to_string(create_email({name: '', address: 'f@x'},
            {name: '', address: 't@x'}, 'S', html))
        const body = raw.split('\r\n\r\n')[1]!
        expect(body.split('\r\n').every(line => line.length <= 76)).toBe(true)
        expect(utf8_to_string(base64_to_buffer(body.replaceAll('\r\n', '')))).toBe(html)
    })
})

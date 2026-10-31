
import {afterEach, beforeAll, beforeEach, describe, expect, test, vi} from 'vitest'

import {mock_fetch, set_store_state, FetchMock} from '../../tests/unit_utils'
import {displayer_config} from './displayer_config'
import {respond_address, respond_reaction, respond_read, respond_reply, respond_resend,
    respond_subscribe, respond_subscription} from './responses'
import {utf8_to_string} from './utils/coding'
import {decrypt_asym, generate_key_asym} from './utils/crypt'


const RESPONDER = 'https://responder/'


// Key pair for encrypting responses
let private_key:CryptoKey

beforeAll(async () => {
    const pair = await generate_key_asym(false, ['encrypt', 'decrypt'])
    private_key = pair.privateKey
    displayer_config.resp_key_public = pair.publicKey
})


async function sent(fetch_mock:FetchMock, index=0){
    // Get the url, unencrypted, and decrypted parts of a sent response
    const call = fetch_mock.calls[index]!
    const body = JSON.parse(call.init.body as string) as Record<string, unknown>
    const decrypted = JSON.parse(utf8_to_string(
        await decrypt_asym(body['encrypted'] as string, private_key))) as Record<string, unknown>
    return {url: call.url, body, decrypted}
}


describe('responses', () => {

    let fetch_mock:FetchMock

    beforeEach(() => {
        set_store_state({dict: {dark: false, last_read: null, config_secret: 'conf',
            unsubscribed: []}})
        displayer_config.responder = RESPONDER
        displayer_config.notify_include_contents = false
        fetch_mock = mock_fetch(Object.fromEntries(
            ['read', 'reply', 'reaction', 'subscription', 'address', 'resend', 'subscribe']
                .map(type => [RESPONDER + type, new Response(null, {status: 200})]),
        ))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    // Common request details
    test('read posts encrypted data with config secret and user agent', async () => {
        expect(await respond_read('tok', 'copy', true)).toBe(true)
        const {url, body, decrypted} = await sent(fetch_mock)
        expect(url).toBe(RESPONDER + 'read')
        expect(fetch_mock.calls[0]!.init.method).toBe('POST')
        expect(body).toMatchObject({copy_id: 'copy', has_max_reads: true, config_secret: 'conf'})
        expect(decrypted).toEqual({resp_token: 'tok', user_agent: self.navigator.userAgent})
    })

    // Content is encrypted by default
    test('reply content is encrypted when not notifying with contents', async () => {
        await respond_reply('tok', "Hello", 'sect', 'sub')
        const {body, decrypted} = await sent(fetch_mock)
        expect(body['content']).toBe(undefined)
        expect(decrypted).toMatchObject({resp_token: 'tok', content: "Hello", section_id: 'sect',
            subsection_id: 'sub'})
    })

    // Content outside encryption so responder can include it in notifications
    test('content is unencrypted when notifying with contents', async () => {
        displayer_config.notify_include_contents = true
        await respond_reply('tok', "Hello", null, null)
        await respond_reaction('tok', 'like', 'sect', null)
        await respond_resend('tok', "Reason")
        await respond_subscribe('form', 'a@b.c', "Name", "Msg")
        const contents = await Promise.all([0, 1, 2, 3].map(async i => {
            const {body, decrypted} = await sent(fetch_mock, i)
            return [body['content'], decrypted['content']]
        }))
        expect(contents).toEqual([["Hello", undefined], ['like', undefined],
            ["Reason", undefined], ["Msg", undefined]])
        expect((await sent(fetch_mock, 3)).body).toMatchObject({form: 'form', address: 'a@b.c',
            name: "Name"})
    })

    // Other response types
    test('reaction, subscription, address, resend and subscribe payloads', async () => {
        await respond_reaction('tok', null, 'sect', 'sub')
        await respond_subscription('tok', false, 'enc')
        await respond_address('tok', 'new@x.y', null)
        await respond_resend('tok', "Reason")
        await respond_subscribe('form', 'a@b.c', "Name", "Msg")
        const results = await Promise.all([0, 1, 2, 3, 4].map(i => sent(fetch_mock, i)))
        expect(results.map(r => r.url.slice(RESPONDER.length))).toEqual(
            ['reaction', 'subscription', 'address', 'resend', 'subscribe'])
        expect(results[0]!.decrypted).toMatchObject({content: null, section_id: 'sect',
            subsection_id: 'sub'})
        expect(results[1]!.decrypted).toMatchObject({subscribed: false, sym_encrypted: 'enc'})
        expect(results[2]!.decrypted).toMatchObject({new_address: 'new@x.y',
            sym_encrypted: null})
        expect(results[3]!.decrypted).toMatchObject({content: "Reason"})
        expect(results[4]!.body['form']).toBe('form')
        expect(results[4]!.decrypted).toMatchObject({address: 'a@b.c', name: "Name",
            content: "Msg"})
    })

    // Server errors
    test('bad status returns false and reports error', async () => {
        fetch_mock.routes[RESPONDER + 'read'] = new Response(null, {status: 500})
        const report = vi.spyOn(self, 'app_report_error').mockImplementation(() => undefined)
        expect(await respond_read('tok', 'copy', false)).toBe(false)
        expect(report).toHaveBeenCalledOnce()
    })

    // Network errors
    test('network failure returns false without reporting', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        vi.stubGlobal('fetch', () => Promise.reject(new TypeError("offline")))
        const report = vi.spyOn(self, 'app_report_error').mockImplementation(() => undefined)
        expect(await respond_read('tok', 'copy', false)).toBe(false)
        expect(report).not.toHaveBeenCalled()
    })

    // Programming errors
    test('throws if config not loaded', async () => {
        displayer_config.responder = null
        await expect(respond_read('tok', 'copy', false)).rejects.toThrow("Config not loaded")
    })
})

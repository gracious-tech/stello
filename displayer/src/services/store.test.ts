
import {afterEach, beforeAll, beforeEach, describe, expect, test, vi} from 'vitest'

import DialogChangeAddress from '../components/DialogChangeAddress.vue'
import DialogSubscribe from '../components/DialogSubscribe.vue'
import DialogUnsub from '../components/DialogUnsub.vue'
import {binary_response, encrypt_json, make_copy, make_msg, mock_fetch, new_secret,
    set_store_state, FetchMock} from '../../tests/unit_utils'
import {database} from './database'
import {displayer_config} from './displayer_config'
import {store} from './store'
import {buffer_to_url64, string_to_utf8, url64_to_buffer} from './utils/coding'
import {encrypt_sym, export_key, generate_hash, generate_key_asym} from './utils/crypt'

import type {PublishedCopy} from '@/shared/shared_types'


const MSGS = '/dev/messages/_user/'
const CONFIG_URL = '/dev/config/_user/config'


// Public key for configs and the fetch mock used by every test
let resp_key_public:string
let fetch_mock:FetchMock

beforeAll(async () => {
    await database.connect()
    const pair = await generate_key_asym(false, ['encrypt', 'decrypt'])
    resp_key_public = buffer_to_url64(await export_key(pair.publicKey))
})


async function serve_message(id:string, overrides:Partial<PublishedCopy>={})
        :Promise<{secret:string, assets_key:CryptoKey}>{
    // Serve an encrypted message copy and return its secret and assets key
    const secret = await new_secret()
    const assets = await new_secret()
    const copy = make_copy({assets_key: assets.url64, ...overrides})
    fetch_mock.routes[`${MSGS}copies/${id}`] =
        binary_response(await encrypt_json(copy, secret.key))
    return {secret: secret.url64, assets_key: assets.key}
}


async function serve_config(data:Record<string, unknown>={}):Promise<string>{
    // Serve an encrypted displayer config and return its secret
    const secret = await new_secret()
    fetch_mock.routes[CONFIG_URL] = binary_response(await encrypt_json(
        {responder: 'https://r/', resp_key_public, ...data}, secret.key))
    return secret.url64
}


function capture_hashchange():{handler:(() => void)|null}{
    // Capture hashchange listener rather than registering it (avoids leaking between tests)
    const captured:{handler:(() => void)|null} = {handler: null}
    const original = self.addEventListener.bind(self)
    vi.spyOn(self, 'addEventListener').mockImplementation(
        (type:string, handler:unknown, options?:unknown) => {
            if (type === 'hashchange'){
                captured.handler = handler as () => void
                return
            }
            original(type, handler as EventListener, options as AddEventListenerOptions)
        })
    return captured
}


function wait_for_data(){
    // Wait for current message to finish loading (successfully or not)
    return vi.waitFor(() => {
        if (!store.state.msg?.data && !store.state.msg?.data_error){
            throw new Error("Not loaded yet")
        }
    })
}


describe('DisplayerStore', () => {

    beforeEach(async () => {
        // Fresh db, globals and config
        for (const name of ['dict', 'messages', 'reactions', 'replies'] as const){
            await database._conn.clear(name)
        }
        fetch_mock = mock_fetch()
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        vi.stubGlobal('Image', class {
            width = 1
            height = 1
            onload:(() => void)|null = null
            set src(value:string){
                setTimeout(() => this.onload?.())
            }
        })
        self.location.hash = ''
        self.app_hash = ''
        self.app_failed = false
        displayer_config.responder = null
        displayer_config.error = null
    })

    afterEach(async () => {
        // Let any background message download finish before fetch is unstubbed
        if (store._state?.msg){
            await wait_for_data()
        }
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })


    // INIT

    test('init uses defaults and db values', async () => {
        capture_hashchange()
        vi.spyOn(self, 'matchMedia').mockReturnValue({matches: true} as MediaQueryList)
        await database.dict_set('unsubscribed', ['x'])
        await store.init()
        expect(store.state.dict).toMatchObject({dark: true, last_read: null,
            config_secret: null, unsubscribed: ['x']})
        expect(store.state.webp_supported).toBe(true)
        expect(store.state.msg).toBe(null)
        expect(store.state.history).toEqual([])
    })

    test('init loads last read message when no hash', async () => {
        capture_hashchange()
        const {secret} = await serve_message('m1')
        await database.message_set({id: 'm1', secret_url64: secret, title: "Old",
            published: new Date('2024-01-01')})
        await database.dict_set('last_read', 'm1')
        await store.init()
        await vi.waitFor(() => expect(store.state.msg?.id).toBe('m1'))
        expect(store.state.msg?.title).toBe("Old")
        await wait_for_data()
        expect(store.state.msg?.data?.title).toBe("Title")
    })

    test('init processes hash from index and clears it from url', async () => {
        capture_hashchange()
        const {secret} = await serve_message('m2')
        const config_secret = await serve_config()
        self.app_hash = `#${config_secret},m2,${secret}`
        self.location.hash = self.app_hash
        await store.init()
        expect(self.location.hash).toBe('')
        expect(store.state.msg?.id).toBe('m2')
        expect(store.state.dict.config_secret).toBe(config_secret)
        expect(await database.dict_get('config_secret')).toBe(config_secret)
        expect(displayer_config.responder).toBe('https://r/')
    })

    test('hashchange triggers processing unless cleared or restoring after failure', async () => {
        const captured = capture_hashchange()
        await store.init()
        const process = vi.spyOn(store, 'process_hash').mockResolvedValue()

        // Cleared hash
        captured.handler!()
        expect(process).not.toHaveBeenCalled()

        // New hash
        self.location.hash = '#abc'
        captured.handler!()
        expect(process).toHaveBeenCalledOnce()

        // Restored hash after failure
        self.app_failed = true
        self.app_hash = '#abc'
        captured.handler!()
        expect(process).toHaveBeenCalledOnce()
    })


    // PROCESS HASH

    test('process_hash keeps hash in url when failed', async () => {
        set_store_state()
        self.app_failed = true
        self.location.hash = '#abc'
        await store.process_hash()
        expect(self.location.hash).toBe('#abc')
    })

    test('process_hash prefers previously stored config secret', async () => {
        const stored = await serve_config({allow_replies: true})
        set_store_state({dict: {dark: false, last_read: null, config_secret: stored,
            unsubscribed: []}})
        self.location.hash = '#other,m,s'
        await store.process_hash()
        expect(store.state.dict.config_secret).toBe(stored)
        expect(displayer_config.allow_replies).toBe(true)
    })

    test('process_hash shows subscribe form and loads its config', async () => {
        const config_secret = await serve_config()
        const form_secret = await new_secret()
        const form = {id: 'f', text: "Join", accept_message: false,
            config_secret_url64: config_secret}
        fetch_mock.routes['/dev/config/_user/subscribe'] = Response.json([
            buffer_to_url64(await encrypt_json(form, form_secret.key))])
        set_store_state()
        self.location.hash = `#${form_secret.url64}`
        await store.process_hash()
        expect(store.state.dialog?.component).toBe(DialogSubscribe)
        expect(store.state.dialog?.persistent).toBe(true)
        expect(store.state.dialog?.props).toEqual({form})
        expect(store.state.dict.config_secret).toBe(config_secret)
        expect(store.state.msg).toBe(null)
    })

    test('process_hash ignores unknown subscribe form', async () => {
        set_store_state()
        self.location.hash = `#${(await new_secret()).url64}`
        await store.process_hash()
        expect(store.state.dialog).toBe(null)
    })

    test('process_hash opens unsub and address dialogs for actions', async () => {
        const config_secret = await serve_config()
        const {secret} = await serve_message('m')
        set_store_state()

        self.location.hash = `#${config_secret},m,${secret},unsub,enc`
        await store.process_hash()
        expect(store.state.dialog?.component).toBe(DialogUnsub)
        expect(store.state.dialog?.props).toEqual({encrypted_address: 'enc'})

        self.location.hash = `#${config_secret},m,${secret},address,enc2`
        await store.process_hash()
        expect(store.state.dialog?.component).toBe(DialogChangeAddress)
        expect(store.state.dialog?.props).toEqual({encrypted_address: 'enc2'})
    })

    test('process_hash skips unsub dialog if already unsubscribed', async () => {
        const config_secret = await serve_config()
        const {secret} = await serve_message('m')
        const token = buffer_to_url64(await generate_hash(url64_to_buffer(secret), 0))
        set_store_state({dict: {dark: false, last_read: null, config_secret: null,
            unsubscribed: [token]}})
        self.location.hash = `#${config_secret},m,${secret},unsub`
        await store.process_hash()
        expect(store.unsubscribed).toBe(true)
        expect(store.state.dialog).toBe(null)
    })

    test('process_hash skips actions when account disabled', async () => {
        fetch_mock.routes[CONFIG_URL] = new Response(null, {status: 404})
        const {secret} = await serve_message('m')
        set_store_state()
        self.location.hash = `#conf,m,${secret},unsub`
        await store.process_hash()
        expect(displayer_config.error).toBe('inactive')
        expect(store.state.dict.config_secret).toBe(null)
        expect(store.state.dialog).toBe(null)
        expect(store.state.msg?.id).toBe('m')
    })


    // MESSAGE DATA

    test('change_msg generates resp token and resets title', async () => {
        const {secret} = await serve_message('m')
        set_store_state()
        await store.change_msg('m', secret, "Title?", null)
        expect(self.document.title).toBe("Title?")
        expect(store.state.msg?.resp_token).toBe(
            buffer_to_url64(await generate_hash(url64_to_buffer(secret), 0)))
        await wait_for_data()
    })

    test('change_msg with invalid secret gives corrupted error', async () => {
        await serve_message('m')
        set_store_state()
        await store.change_msg('m', '!!!', null, null)
        expect(self.document.title).toBe("Message Viewer")
        expect(store.state.msg?.resp_token).toBe('')
        await wait_for_data()
        expect(store.state.msg?.data_error).toBe('corrupted')
    })

    test('get_msg_data success saves meta, sends read and sets title', async () => {
        displayer_config.responder = 'https://r/'
        displayer_config.resp_key_public = (await generate_key_asym(false,
            ['encrypt', 'decrypt'])).publicKey
        fetch_mock.routes['https://r/read'] = new Response(null, {status: 200})
        const {secret} = await serve_message('m', {title: "Loaded", has_max_reads: true})
        set_store_state()
        await store.change_msg('m', secret, null, null)
        await wait_for_data()
        expect(self.document.title).toBe("Loaded")
        await vi.waitFor(() => expect(store.state.history).toHaveLength(1))
        expect(store.state.history[0]).toMatchObject({id: 'm', title: "Loaded",
            published: new Date('2024-01-02T03:04:05Z')})
        expect(await database.dict_get('last_read')).toBe('m')
        await vi.waitFor(() => expect(fetch_mock.calls.map(c => c.url))
            .toContain('https://r/read'))
    })

    test('get_msg_data converts old section format', async () => {
        const section = {id: 's', respondable: true,
            content: {type: 'text', html: '', standout: null}}
        const {secret} = await serve_message('m',
            {sections: [section] as unknown as PublishedCopy['sections']})
        set_store_state()
        await store.change_msg('m', secret, null, null)
        await wait_for_data()
        expect(store.state.msg?.data?.sections).toEqual([[section]])
    })

    test('get_msg_data errors for network, expired and wrong key', async () => {
        set_store_state()

        // Expired (404)
        await store.change_msg('gone', (await new_secret()).url64, null, null)
        await wait_for_data()
        expect(store.state.msg?.data_error).toBe('expired')

        // Expired (dev server serving index.html)
        fetch_mock.routes[`${MSGS}copies/html`] =
            binary_response(string_to_utf8('<!DOCTYPE html>'))
        await store.change_msg('html', (await new_secret()).url64, null, null)
        await wait_for_data()
        expect(store.state.msg?.data_error).toBe('expired')

        // Wrong key
        await serve_message('m')
        await store.change_msg('m', (await new_secret()).url64, null, null)
        await wait_for_data()
        expect(store.state.msg?.data_error).toBe('corrupted')

        // Network (with retry clearing the error)
        vi.stubGlobal('fetch', () => Promise.reject(new TypeError("offline")))
        await store.get_msg_data()
        expect(store.state.msg?.data_error).toBe('network')
    })


    // ASSETS

    test('get_asset downloads, decrypts and caches', async () => {
        const {secret, assets_key} = await serve_message('m')
        const asset_url = `${MSGS}assets/base/a1`
        fetch_mock.routes[asset_url] = binary_response(
            await encrypt_sym(new Uint8Array([1, 2, 3]).buffer, assets_key))
        set_store_state()
        await store.change_msg('m', secret, null, null)
        await wait_for_data()
        expect(new Uint8Array((await store.get_asset('a1'))!)).toEqual(new Uint8Array([1, 2, 3]))
        expect(new Uint8Array((await store.get_asset('a1'))!)).toEqual(new Uint8Array([1, 2, 3]))
        expect(fetch_mock.calls.filter(c => c.url === asset_url)).toHaveLength(1)
    })

    test('get_asset returns null on missing or failed download', async () => {
        const report = vi.spyOn(self, 'app_report_error').mockImplementation(() => undefined)
        const {secret} = await serve_message('m')
        fetch_mock.routes[`${MSGS}assets/base/bad`] = new Response(null, {status: 500})
        set_store_state()
        await store.change_msg('m', secret, null, null)
        await wait_for_data()
        expect(await store.get_asset('missing')).toBe(null)
        expect(report).not.toHaveBeenCalled()
        expect(await store.get_asset('bad')).toBe(null)
        expect(report).toHaveBeenCalledOnce()
    })


    // SIMPLE MUTATIONS

    test('page, dark, transition and dialog mutations', async () => {
        set_store_state()
        store._state.msg = make_msg()
        const page = {id: 'p', respondable: false, content: {type: 'page' as const,
            button: true, headline: '', desc: '', image: null, sections: []}}
        store.change_page(page)
        expect(store.state.msg?.page?.id).toBe('p')
        store.change_page(null)
        expect(store.state.msg?.page).toBe(null)

        store.toggle_dark()
        expect(store.state.dict.dark).toBe(true)
        await vi.waitFor(async () => expect(await database.dict_get('dark')).toBe(true))

        store.change_transition('prev')
        expect(store.state.transition).toBe('prev')

        store.dialog_open(DialogUnsub)
        expect(store.state.dialog).toEqual({component: DialogUnsub, props: {},
            persistent: false})
        store.dialog_close()
        expect(store.state.dialog).toBe(null)
    })

    test('unsubscribed is false without a message', () => {
        set_store_state({dict: {dark: false, last_read: null, config_secret: null,
            unsubscribed: ['token']}})
        expect(store.unsubscribed).toBe(false)
    })

    test('update_subscribed toggles token in db and sends response', async () => {
        displayer_config.responder = 'https://r/'
        displayer_config.resp_key_public = (await generate_key_asym(false,
            ['encrypt', 'decrypt'])).publicKey
        fetch_mock.routes['https://r/subscription'] = new Response(null, {status: 200})
        set_store_state()
        store._state.msg = make_msg({resp_token: 'tok'})

        await store.update_subscribed(false, 'enc')
        await store.update_subscribed(false)  // No duplicate
        expect(store.state.dict.unsubscribed).toEqual(['tok'])
        expect(await database.dict_get('unsubscribed')).toEqual(['tok'])
        expect(store.unsubscribed).toBe(true)

        await store.update_subscribed(true)
        expect(store.state.dict.unsubscribed).toEqual([])
        expect(store.unsubscribed).toBe(false)
        expect(fetch_mock.calls.filter(c => c.url === 'https://r/subscription')).toHaveLength(3)
    })
})

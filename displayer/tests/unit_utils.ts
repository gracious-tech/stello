// Shared fixtures for displayer unit tests (fetch routing, encryption, store state)

import {reactive, readonly} from 'vue'
import {vi} from 'vitest'

import {store, StoreState, MessageAccess} from '@/services/store'
import {buffer_to_url64, string_to_utf8} from '@/services/utils/coding'
import {encrypt_sym, export_key, generate_key_sym} from '@/services/utils/crypt'
import type {PublishedCopy} from '@/shared/shared_types'


// Response value or function that generates one for a fetch route
type RouteHandler = Response|((init:RequestInit) => Response|Promise<Response>)


export interface FetchMock {
    routes:Record<string, RouteHandler>
    calls:{url:string, init:RequestInit}[]
}


export function mock_fetch(routes:Record<string, RouteHandler>={}):FetchMock{
    // Stub global fetch so that requests are routed to given handlers (404 if no match)
    const mock:FetchMock = {routes, calls: []}
    vi.stubGlobal('fetch', async (input:string, init:RequestInit={}) => {
        mock.calls.push({url: input, init})
        const handler = mock.routes[input]
        if (!handler){
            return new Response(null, {status: 404})
        }
        if (typeof handler === 'function'){
            return handler(init)
        }
        return handler.clone()
    })
    return mock
}


export async function new_secret():Promise<{key:CryptoKey, url64:string}>{
    // Generate a symmetric key and its url64 form (like a hash secret)
    const key = await generate_key_sym(true, ['encrypt', 'decrypt'])
    return {key, url64: buffer_to_url64(await export_key(key))}
}


export async function encrypt_json(data:unknown, key:CryptoKey):Promise<ArrayBuffer>{
    // Encrypt JSON-serialisable data with given key
    return encrypt_sym(string_to_utf8(JSON.stringify(data)), key)
}


export function binary_response(data:ArrayBuffer):Response{
    // Create a response with binary contents
    return new Response(data, {status: 200})
}


export function make_copy(overrides:Partial<PublishedCopy>={}):PublishedCopy{
    // Create a published copy of a message with sensible defaults
    return {
        title: "Title",
        published: '2024-01-02T03:04:05Z',
        base_msg_id: 'base',
        sections: [],
        assets_key: '',
        has_max_reads: false,
        permission_subscription: true,
        contact_address: 'old@example.com',
        ...overrides,
    }
}


export function make_msg(overrides:Partial<MessageAccess>={}):MessageAccess{
    // Create a message access object with sensible defaults
    return {
        id: 'msg',
        secret_url64: 'secret',
        title: null,
        published: null,
        resp_token: 'token',
        data: make_copy(),
        data_error: null,
        page: null,
        assets_key: null,
        assets_cache: {},
        ...overrides,
    }
}


export function set_store_state(overrides:Partial<StoreState>={}):StoreState{
    // Manually init store's state without needing to run `init()`
    store._state = reactive<StoreState>({
        dict: {dark: false, last_read: null, config_secret: null, unsubscribed: []},
        history: [],
        msg: null,
        webp_supported: true,
        transition: 'none',
        dialog: null,
        ...overrides,
    }) as StoreState
    store.state = readonly(store._state)
    return store._state
}

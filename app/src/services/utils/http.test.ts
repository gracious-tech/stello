
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {request, request_json, request_text, request_blob, request_buffer, RequestErrorStatus,
    RequestErrorBody, report_http_failure} from './http'
import {MustReconnect} from './exceptions'


// Capture the args fetch was called with
let fetch_mock:ReturnType<typeof vi.fn>

beforeEach(() => {
    fetch_mock = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetch_mock)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})


// Helper to get the init arg of the last fetch call
function last_init():RequestInit{
    return fetch_mock.mock.calls.at(-1)![1] as RequestInit
}


describe('request body handling', () => {

    test('json is stringified with content type and custom props removed', async () => {
        await request('https://x/', {json: {a: 1}, method: 'POST'})
        const init = last_init() as RequestInit & {json?:unknown}
        expect(init.body).toBe('{"a":1}')
        expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
        expect('json' in init).toBe(false)
        expect('compress' in init).toBe(false)
    })

    test('blob body content type is preserved', async () => {
        await request('https://x/', {body: new Blob(['x'], {type: 'image/png'}), method: 'POST'})
        expect(new Headers(last_init().headers).get('Content-Type')).toBe('image/png')
    })

    test('untyped body defaults to octet-stream', async () => {
        await request('https://x/', {body: 'text', method: 'POST'})
        expect(new Headers(last_init().headers).get('Content-Type'))
            .toBe('application/octet-stream')
    })

    test('existing content type is not overridden', async () => {
        await request('https://x/', {body: 'x', method: 'POST',
            headers: {'Content-Type': 'text/csv'}})
        expect(new Headers(last_init().headers).get('Content-Type')).toBe('text/csv')
    })

    test('compresses body when requested and supported', async () => {
        vi.stubGlobal('CompressionStream', CompressionStream)
        await request('https://x/', {body: 'x'.repeat(1000), method: 'POST', compress: true})
        const init = last_init()
        expect(new Headers(init.headers).get('Content-Encoding')).toBe('gzip')
        expect(init.body).toBeInstanceOf(Blob)
        expect((init.body as Blob).size).toBeLessThan(1000)
    })

    test('json body of falsy value is still sent', async () => {
        // Falsy JSON values (0/false/'') are still valid bodies
        await request('https://x/', {json: false, method: 'POST'})
        expect(last_init().body).toBe('false')
    })

    test('accepts a Request object as input', async () => {
        await request(new Request('https://y/'))
        expect(fetch_mock).toHaveBeenCalledTimes(1)
    })
})


describe('request errors', () => {

    test('network failure throws MustReconnect including url', async () => {
        fetch_mock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
        await expect(request('https://x/')).rejects.toThrow(MustReconnect)
        fetch_mock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
        await expect(request('https://x/')).rejects.toThrow('https://x/')
    })

    test('bad status throws when configured', async () => {
        fetch_mock.mockResolvedValueOnce(new Response('', {status: 500}))
        const promise = request('https://x/', {}, 'text', 'throw')
        await expect(promise).rejects.toBeInstanceOf(RequestErrorStatus)
        fetch_mock.mockResolvedValueOnce(new Response('', {status: 500}))
        await expect(request('https://x/', {}, 'text', 'throw')).rejects.toMatchObject({
            status: 500, url: 'https://x/'})
    })

    test('bad status returned as is when not configured', async () => {
        fetch_mock.mockResolvedValueOnce(new Response('', {status: 500}))
        const resp = await request('https://x/')
        expect(resp.status).toBe(500)
    })

    test('null404 returns null for 404 only', async () => {
        fetch_mock.mockResolvedValueOnce(new Response('', {status: 404}))
        expect(await request('https://x/', {}, 'text', 'throw_null404')).toBe(null)
        fetch_mock.mockResolvedValueOnce(new Response('', {status: 403}))
        await expect(request('https://x/', {}, 'text', 'throw_null404'))
            .rejects.toBeInstanceOf(RequestErrorStatus)
    })

    test('null403-4 returns null for both 403 and 404', async () => {
        fetch_mock.mockResolvedValueOnce(new Response('', {status: 403}))
        expect(await request('https://x/', {}, 'text', 'throw_null403-4')).toBe(null)
        fetch_mock.mockResolvedValueOnce(new Response('', {status: 404}))
        expect(await request('https://x/', {}, 'text', 'throw_null403-4')).toBe(null)
    })

    test('body parse error throws RequestErrorBody', async () => {
        fetch_mock.mockResolvedValueOnce(new Response('not json'))
        await expect(request_json('https://x/')).rejects.toBeInstanceOf(RequestErrorBody)
    })

    test('body read TypeError throws MustReconnect', async () => {
        const resp = new Response('x')
        vi.spyOn(resp, 'text').mockRejectedValue(new TypeError('interrupted'))
        fetch_mock.mockResolvedValueOnce(resp)
        await expect(request_text('https://x/')).rejects.toBeInstanceOf(MustReconnect)
    })
})


describe('shortcuts', () => {

    test('read different body types', async () => {
        fetch_mock.mockResolvedValueOnce(new Response('{"a":1}'))
        expect(await request_json('https://x/')).toEqual({a: 1})
        fetch_mock.mockResolvedValueOnce(new Response('text'))
        expect(await request_text('https://x/')).toBe('text')
        fetch_mock.mockResolvedValueOnce(new Response('blob'))
        expect(await (await request_blob('https://x/')).text()).toBe('blob')
        fetch_mock.mockResolvedValueOnce(new Response('ab'))
        expect((await request_buffer('https://x/')).byteLength).toBe(2)
    })
})


describe('report_http_failure', () => {

    test('reports only non-network errors', () => {
        const spy = vi.fn()
        self.app_report_error = spy
        report_http_failure(new MustReconnect())
        expect(spy).not.toHaveBeenCalled()
        report_http_failure(new Error('x'))
        expect(spy).toHaveBeenCalledTimes(1)
    })
})

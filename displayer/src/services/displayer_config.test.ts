
import {afterEach, beforeAll, beforeEach, describe, expect, test, vi} from 'vitest'

import {binary_response, encrypt_json, mock_fetch, new_secret} from '../../tests/unit_utils'
import {buffer_to_url64} from './utils/coding'
import {export_key, generate_key_asym} from './utils/crypt'


const CONFIG_URL = '/dev/config/_user/config'


// Public key in url64 form that configs can include
let resp_key_public:string

beforeAll(async () => {
    const pair = await generate_key_asym()
    resp_key_public = buffer_to_url64(await export_key(pair.publicKey))
})


async function fresh_config(){
    // Import a fresh instance of the config (it's a singleton)
    vi.resetModules()
    return (await import('./displayer_config')).displayer_config
}


async function serve_config(data:Record<string, unknown>, url=CONFIG_URL):Promise<string>{
    // Serve given config encrypted and return the secret needed to decrypt it
    const secret = await new_secret()
    mock_fetch({[url]: binary_response(await encrypt_json(data, secret.key))})
    return secret.url64
}


describe('displayer_config', () => {

    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    // Defaults before loading
    test('has safe defaults before loading', async () => {
        const config = await fresh_config()
        expect(config.responder).toBe(null)
        expect(config.allow_replies).toBe(false)
        expect(config.reaction_options).toContain('like')
        expect(config.theme_style).toBe('modern')
    })

    // Successful load
    test('loads and applies a valid config', async () => {
        const secret = await serve_config({version: '1.2.3', responder: 'https://r/',
            allow_replies: true, allow_comments: false, allow_reactions: true, resp_key_public,
            theme_style: 'fun'})
        const config = await fresh_config()
        expect(await config.safe_load(secret)).toBe(true)
        expect(config.error).toBe(null)
        expect(config.version).toBe('1.2.3')
        expect(config.responder).toBe('https://r/')
        expect(config.allow_replies).toBe(true)
        expect(config.allow_comments).toBe(false)
        expect(config.allow_reactions).toBe(true)
        expect(config.theme_style).toBe('fun')
        expect(config.resp_key_public?.type).toBe('public')
    })

    // Backwards compatibility
    test('allow_comments defaults to allow_replies for old configs', async () => {
        const secret = await serve_config({responder: 'https://r/', allow_replies: true,
            resp_key_public})
        const config = await fresh_config()
        expect(await config.safe_load(secret)).toBe(true)
        expect(config.allow_comments).toBe(true)
    })

    // Deleted config
    test('missing config means account inactive and disables responses', async () => {
        mock_fetch({[CONFIG_URL]: new Response(null, {status: 403})})
        const config = await fresh_config()
        config.allow_replies = true
        expect(await config.safe_load('secret')).toBe(false)
        expect(config.error).toBe('inactive')
        expect(config.responder).toBe(false)
        expect(config.allow_replies).toBe(false)
    })

    // Network issues
    test('network failure sets network error', async () => {
        vi.stubGlobal('fetch', () => Promise.reject(new TypeError("offline")))
        const config = await fresh_config()
        expect(await config.safe_load('secret')).toBe(false)
        expect(config.error).toBe('network')
    })

    // Bad secret
    test('wrong secret sets decrypt error', async () => {
        await serve_config({resp_key_public})
        const other = await new_secret()
        const config = await fresh_config()
        expect(await config.safe_load(other.url64)).toBe(false)
        expect(config.error).toBe('decrypt')
    })

    // Unexpected errors
    test('unexpected errors are reported but not thrown', async () => {
        const secret = await serve_config({resp_key_public: 'not-a-key'})
        const report = vi.spyOn(self, 'app_report_error').mockImplementation(() => undefined)
        const config = await fresh_config()
        expect(await config.safe_load(secret)).toBe(false)
        expect(report).toHaveBeenCalledOnce()
    })

    // Hosted setups
    test('hosted displayer forces responder url based on domain', async () => {
        // NOTE Hosted user is determined by subdomain
        const secret = await serve_config({responder: 'https://ignored/', resp_key_public},
            '/dev/config/user/config')
        vi.stubEnv('VITE_HOSTED_MSGS_URL', 'https://msgs.example.com/')
        vi.spyOn(self.location, 'hostname', 'get').mockReturnValue('user.example.com')
        const config = await fresh_config()
        expect(await config.safe_load(secret)).toBe(true)
        expect(config.responder).toBe('https://api.example.com/responder/')
    })

    // Local dev
    test('local responder override during development', async () => {
        const secret = await serve_config({responder: 'https://ignored/', resp_key_public})
        vi.stubEnv('VITE_LOCAL_RESPONDER', 'true')
        const config = await fresh_config()
        expect(await config.safe_load(secret)).toBe(true)
        expect(config.responder).toBe('http://127.0.0.1:8004/responder/')
    })
})

// @vitest-environment happy-dom

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {setup_globals, MockStore} from '@/../tests/unit_utils'
import {Database} from '../database/database'
import {OAuth} from '../database/oauths'
import {oauth_request, oauth_refresh, oauth_revoke, oauth_revoke_if_obsolete,
    scope_set_for_task, oauth_pretask_new_usage, oauth_pretask_reauth, oauth_pretask_process}
    from './oauth'
import {task_manager} from './tasks'
import {external_encrypt, external_decrypt} from '../misc/external_crypt'
import {MustReauthenticate, MustReconnect} from '../utils/exceptions'
import {buffer_to_standard_url64, string_to_utf8} from '../utils/coding'
import {sleep} from '../utils/async'


// Fake AppAuth library so flows can be tested without real issuers
const appauth = vi.hoisted(() => {
    const state = {
        token_resp: {} as Record<string, unknown>,
        token_error: null as unknown,
        revoke_error: null as unknown,
        fetch_config_error: null as unknown,
        auth_requests: [] as Record<string, unknown>[],
        token_requests: [] as Record<string, unknown>[],
        revoke_requests: [] as Record<string, unknown>[],
        pending_request: null as null|{internal:unknown, clientId:string},
        complete_error: null as unknown,
    }
    class AppAuthError extends Error {
        constructor(message:string, public extras?:unknown){super(message)}
    }
    class AuthorizationServiceConfiguration {
        constructor(public json:unknown){}
        static async fetchFromIssuer(endpoint:string){
            if (state.fetch_config_error){
                throw state.fetch_config_error
            }
            return {endpoint}
        }
    }
    class AuthorizationNotifier {
        listener:((req:unknown, resp:unknown, error:unknown)=>void)|null = null
        setAuthorizationListener(listener:AuthorizationNotifier['listener']){
            this.listener = listener
        }
    }
    class RedirectRequestHandler {
        notifier:AuthorizationNotifier|null = null
        performAuthorizationRequest(config:unknown, request:Record<string, unknown>){
            state.auth_requests.push({config, ...request})
        }
        setAuthorizationNotifier(notifier:AuthorizationNotifier){
            this.notifier = notifier
        }
        async completeAuthorizationRequestIfPossible(){
            this.notifier!.listener!(state.pending_request, {code: 'code'}, state.complete_error)
        }
    }
    class BaseTokenRequestHandler {
        async performTokenRequest(config:unknown, request:Record<string, unknown>){
            state.token_requests.push(request)
            if (state.token_error){
                throw state.token_error
            }
            return state.token_resp
        }
        async performRevokeTokenRequest(config:unknown, request:Record<string, unknown>){
            state.revoke_requests.push(request)
            if (state.revoke_error){
                throw state.revoke_error
            }
        }
    }
    // Request classes just store their args
    class Stored {
        constructor(args:Record<string, unknown>){Object.assign(this, args)}
    }
    class BasicQueryStringUtils {
        parseQueryString(){return {}}
    }
    const module = {AppAuthError, AuthorizationServiceConfiguration, AuthorizationNotifier,
        RedirectRequestHandler, BaseTokenRequestHandler, BasicQueryStringUtils,
        FetchRequestor: class {}, AuthorizationRequest: Stored, TokenRequest: Stored,
        RevokeTokenRequest: Stored}
    return {state, module}
})
vi.mock('@openid/appauth/src', () => appauth.module)
vi.mock('@openid/appauth', () => appauth.module)


let db:Database
let store:MockStore

beforeEach(async () => {
    ({db, store} = await setup_globals())
    Object.assign(appauth.state, {token_resp: {}, token_error: null, revoke_error: null,
        fetch_config_error: null, auth_requests: [], token_requests: [], revoke_requests: [],
        pending_request: null, complete_error: null})
    vi.spyOn(task_manager, 'start').mockResolvedValue(undefined as never)
})

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})


// Helper for creating an oauth record
async function new_oauth(props:Partial<OAuth>={}){
    return db.oauths.create({
        issuer: 'google', issuer_id: 'gid', issuer_config: {}, email: 'a@gmail.com', name: 'A',
        scope_sets: ['email_send'], token_refresh: await external_encrypt('refresh1'),
        token_access: await external_encrypt('access1'), token_access_expires: null,
        contacts_sync: false, contacts_sync_last: null as unknown as Date,
        contacts_sync_token: null as unknown as string, ...props,
    })
}


describe('scope_set_for_task', () => {

    test('maps task names to scope sets', () => {
        expect(scope_set_for_task('contacts_sync')).toBe('contacts')
        expect(scope_set_for_task('send_message')).toBe('email_send')
        expect(scope_set_for_task('cloudbackup_sync')).toBe('storage')
        expect(scope_set_for_task('storage_oauth_setup')).toBe('storage')
        expect(scope_set_for_task('configs_update')).toBe(null)
    })
})


describe('oauth_request', () => {

    test('adds params, auth header and body handling', async () => {
        const fetch_mock = vi.fn(async () => new Response('ok'))
        vi.stubGlobal('fetch', fetch_mock)
        const oauth = await new_oauth({issuer: 'microsoft'})
        await oauth_request(oauth, 'https://api/x', {a: '1', b: ['2', '3']}, 'POST', {j: 1})
        const [url, init] = fetch_mock.mock.calls[0]! as unknown as [string, RequestInit]
        expect(url).toBe('https://api/x?a=1&b=2&b=3')
        expect(new Headers(init.headers).get('Authorization')).toBe('Bearer access1')
        expect(init.body).toBe('{"j":1}')
        expect(new Headers(init.headers).get('Content-Encoding')).toBe(null)  // No MS compression

        await oauth_request(await new_oauth({issuer_id: 'g2'}), 'https://api/y', undefined, 'POST',
            new Blob(['x'], {type: 'text/plain'}))
        const init2 = (fetch_mock.mock.calls[1] as unknown as [string, RequestInit])[1]
        expect(new Headers(init2.headers).get('Content-Type')).toBe('text/plain')
    })

    test('refreshes expired access token first', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('ok')))
        appauth.state.token_resp = {accessToken: 'access2', issuedAt: 1000, expiresIn: 3600}
        const oauth = await new_oauth({token_access_expires: new Date(Date.now() + 1000)})
        await oauth_request(oauth, 'https://api/')
        expect(appauth.state.token_requests[0]).toMatchObject({grant_type: 'refresh_token',
            refresh_token: 'refresh1'})
        expect(await external_decrypt(oauth.token_access)).toBe('access2')
        expect(oauth.token_access_expires).toEqual(new Date(4600 * 1000))
    })
})


describe('oauth_refresh', () => {

    test('requires a refresh token', async () => {
        const oauth = await new_oauth({token_refresh: null as unknown as ArrayBuffer})
        await expect(oauth_refresh(oauth)).rejects.toBeInstanceOf(MustReauthenticate)
    })

    test('maps errors', async () => {
        const oauth = await new_oauth()
        appauth.state.token_error = new TypeError('fetch')
        await expect(oauth_refresh(oauth)).rejects.toBeInstanceOf(MustReconnect)
        appauth.state.token_error = new appauth.module.AppAuthError('x', {error: 'invalid_grant'})
        await expect(oauth_refresh(oauth)).rejects.toBeInstanceOf(MustReauthenticate)
        appauth.state.token_error = new appauth.module.AppAuthError('x', {error: 'other'})
        await expect(oauth_refresh(oauth)).rejects.toBeInstanceOf(appauth.module.AppAuthError)
    })

    test('no expiry results in null expires', async () => {
        appauth.state.token_resp = {accessToken: 'a'}
        const oauth = await new_oauth()
        await oauth_refresh(oauth)
        expect(oauth.token_access_expires).toBe(null)
    })

    test('saves rotated refresh token', async () => {
        // Issuers may rotate refresh tokens, so the new one must be saved
        appauth.state.token_resp = {accessToken: 'a', refreshToken: 'refresh2'}
        const oauth = await new_oauth({issuer: 'microsoft'})
        await oauth_refresh(oauth)
        const saved = (await db.oauths.get(oauth.id))!
        expect(await external_decrypt(saved.token_refresh)).toBe('refresh2')
    })
})


describe('oauth_revoke', () => {

    test('revokes access token and tolerates invalid_grant', async () => {
        const oauth = await new_oauth()
        await oauth_revoke(oauth)
        expect(appauth.state.revoke_requests[0]).toMatchObject({token: 'access1'})
        appauth.state.revoke_error = new appauth.module.AppAuthError('x', {error: 'invalid_grant'})
        await expect(oauth_revoke(oauth)).resolves.toBeUndefined()
        appauth.state.revoke_error = new TypeError()
        await expect(oauth_revoke(oauth)).rejects.toBeInstanceOf(MustReconnect)
        appauth.state.revoke_error = new Error('other')
        await expect(oauth_revoke(oauth)).rejects.toThrow('other')
    })

    test('revoke_if_obsolete keeps oauths still in use', async () => {
        const syncing = await new_oauth({contacts_sync: true})
        await oauth_revoke_if_obsolete(syncing)
        const storage = await new_oauth({issuer_id: '2'})
        store.state.storage_oauth = storage.id
        await oauth_revoke_if_obsolete(storage)
        const sending = await new_oauth({issuer_id: '3'})
        const profile = await db.profiles.create()
        profile.smtp.oauth = sending.id
        await db.profiles.set(profile)
        await oauth_revoke_if_obsolete(sending)
        expect(await db.oauths.list()).toHaveLength(3)
        expect(appauth.state.revoke_requests).toHaveLength(0)

        const obsolete = await new_oauth({issuer_id: '4'})
        await oauth_revoke_if_obsolete(obsolete)
        expect(await db.oauths.get(obsolete.id)).toBeUndefined()
        // NOTE Revoking isn't awaited by oauth_revoke_if_obsolete
        await vi.waitFor(() => expect(appauth.state.revoke_requests).toHaveLength(1))
    })
})


describe('pretask flows', () => {

    test('new usage with matching existing auth and scope starts task directly', async () => {
        const oauth = await new_oauth({scope_sets: ['email_send']})
        await oauth_pretask_new_usage('send_oauth_setup', ['profile1'], 'google', 'a@gmail.com')
        expect(task_manager.start).toHaveBeenCalledWith('send_oauth_setup', [oauth.id, 'profile1'])
        expect(appauth.state.auth_requests).toHaveLength(0)
    })

    test('new usage needing more scopes reauths with all needed scopes', async () => {
        const oauth = await new_oauth({scope_sets: ['email_send'], contacts_sync: false})
        const profile = await db.profiles.create()
        profile.smtp.oauth = oauth.id
        await db.profiles.set(profile)
        store.state.storage_oauth = oauth.id
        await oauth_pretask_new_usage('contacts_oauth_setup', [], 'google', 'a@gmail.com')
        await sleep(0)
        const request = appauth.state.auth_requests[0]!
        expect(request['scope']).toBe('openid email https://www.googleapis.com/auth/contacts '
            + 'https://www.googleapis.com/auth/drive.appdata '
            + 'https://www.googleapis.com/auth/gmail.send')
        expect(request['extras']).toMatchObject({login_hint: 'a@gmail.com', access_type: 'offline'})
        expect(request['internal']).toMatchObject({issuer: 'google',
            meta: {oauth_id: oauth.id, task: ['contacts_oauth_setup', [oauth.id]]}})
    })

    test('new usage asks user to choose when email unknown', async () => {
        const oauth = await new_oauth()
        // User cancels
        store.dispatch.mockResolvedValueOnce(undefined)
        await oauth_pretask_new_usage('send_oauth_setup', ['p'], 'google')
        expect(appauth.state.auth_requests).toHaveLength(0)
        // User chooses existing
        store.dispatch.mockResolvedValueOnce(oauth)
        await oauth_pretask_new_usage('send_oauth_setup', ['p'], 'google')
        expect(task_manager.start).toHaveBeenCalledWith('send_oauth_setup', [oauth.id, 'p'])
        // User chooses new account
        store.dispatch.mockResolvedValueOnce(null)
        await oauth_pretask_new_usage('send_oauth_setup', ['p'], 'google')
        expect(appauth.state.auth_requests[0]!['extras']).toMatchObject(
            {prompt: 'select_account'})
    })

    test('contacts setup ignores oauths already syncing', async () => {
        await new_oauth({contacts_sync: true})
        await oauth_pretask_new_usage('contacts_oauth_setup', [], 'google')
        expect(store.dispatch).not.toHaveBeenCalled()
        expect(appauth.state.auth_requests).toHaveLength(1)
    })

    test('connection failure when fetching issuer config shows snackbar', async () => {
        appauth.state.fetch_config_error = new TypeError('offline')
        await oauth_pretask_reauth(['send_message', []], await new_oauth())
        expect(store.dispatch).toHaveBeenCalledWith('show_snackbar', "Could not connect")
        appauth.state.fetch_config_error = new Error('other')
        await expect(oauth_pretask_reauth(['send_message', []], await new_oauth()))
            .rejects.toThrow('other')
    })
})


describe('oauth_pretask_process', () => {

    // Simulate a pending auth request stored by AppAuth and a token response
    function pending_auth(meta:unknown, refresh_token?:string){
        localStorage.setItem('appauth_current_authorization_request', 'handle')
        localStorage.setItem('handle_appauth_authorization_service_configuration', '{}')
        appauth.state.pending_request = {clientId: 'client',
            internal: {issuer: 'google', meta, code_verifier: 'v'}}
        const id_token = 'x.' + buffer_to_standard_url64(string_to_utf8(JSON.stringify(
            {sub: 'gid', email: 'a@gmail.com', name: 'Name'}))) + '.y'
        appauth.state.token_resp = {idToken: id_token, accessToken: 'new_access',
            refreshToken: refresh_token, issuedAt: 1, expiresIn: 1,
            scope: 'openid email https://www.googleapis.com/auth/gmail.send'}
    }

    test('creates new oauth and starts task with its id', async () => {
        // Empty scope lists (and `always`) must not be recorded as granted scope sets
        pending_auth({task: ['send_oauth_setup', ['p']], oauth_id: null}, 'new_refresh')
        await oauth_pretask_process('http://127.0.0.1/oauth?code=x')
        const oauths = await db.oauths.list()
        expect(oauths).toHaveLength(1)
        expect(oauths[0]!.email).toBe('a@gmail.com')
        expect(oauths[0]!.scope_sets).toEqual(['email_send'])
        expect(appauth.state.token_requests[0]!['extras']).toMatchObject({code_verifier: 'v'})
        expect(task_manager.start).toHaveBeenCalledWith('send_oauth_setup', [oauths[0]!.id, 'p'])
    })

    test('updates existing oauth', async () => {
        const existing = await new_oauth()
        pending_auth({task: ['send_message', ['m']], oauth_id: existing.id}, 'new_refresh')
        await oauth_pretask_process('http://127.0.0.1/oauth?code=x')
        const oauths = await db.oauths.list()
        expect(oauths.map(o => o.id)).toEqual([existing.id])
        expect(await external_decrypt(oauths[0]!.token_access)).toBe('new_access')
        expect(task_manager.start).toHaveBeenCalledWith('send_message', ['m'])
    })

    test('removes duplicate oauth records for same account', async () => {
        await new_oauth()
        await new_oauth()
        pending_auth({task: ['send_message', ['m']], oauth_id: null}, 'r')
        await oauth_pretask_process('http://127.0.0.1/oauth?code=x')
        expect(await db.oauths.list()).toHaveLength(1)
    })

    test('different account than expected does not start task', async () => {
        pending_auth({task: ['send_message', ['m']], oauth_id: 'other_id'}, 'r')
        await oauth_pretask_process('http://127.0.0.1/oauth?code=x')
        expect(task_manager.start).not.toHaveBeenCalled()
    })

    test('reauth without new refresh token keeps existing one', async () => {
        // Google only returns a refresh token on first consent, so keep existing
        const existing = await new_oauth()
        pending_auth({task: ['send_message', ['m']], oauth_id: existing.id}, undefined)
        await oauth_pretask_process('http://127.0.0.1/oauth?code=x')
        const saved = (await db.oauths.get(existing.id))!
        expect(await external_decrypt(saved.token_refresh)).toBe('refresh1')
    })

    test('errors', async () => {
        localStorage.clear()
        await expect(oauth_pretask_process('http://x/')).rejects.toThrow('No pending auth')
        pending_auth({task: ['x', []], oauth_id: null})
        appauth.state.complete_error = new Error('denied')
        await expect(oauth_pretask_process('http://x/')).rejects.toThrow('denied')
        appauth.state.complete_error = null
        appauth.state.token_error = new TypeError()
        await expect(oauth_pretask_process('http://x/')).rejects.toBeInstanceOf(MustReconnect)
        appauth.state.token_error = new Error('bad')
        await expect(oauth_pretask_process('http://x/')).rejects.toThrow('bad')
    })
})

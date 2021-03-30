/* OAuth utils

These function as one possible entry to tasks and execute them once authorization granted
Anything oauth should be considered async (both in execution and UI) since never know if need reauth
Which makes them ideal for handling via tasks only

*/

import * as appauth from '@openid/appauth'
import {AuthorizationServiceConfiguration} from '@openid/appauth'

import DialogOAuthExisting from '@/components/dialogs/specific/DialogOAuthExisting.vue'
import {OAuth} from '../database/oauths'
import {task_manager, TaskStartArgs} from './tasks'
import {drop, MustReauthenticate, MustReconnect, MustRecover} from '../utils/exceptions'


// TYPES


export type OAuthIssuer = 'google'|'microsoft'
export type ScopeSet = 'email_send'|'contacts'


interface IDToken {
    // Required
    iss:string  // Issuer (as a url)
    sub:string  // Subject (issuer's id for the user)
    aud:string|string[]  // Audience (the app requesting tokens)
    exp:number  // Expiration
    iat:number  // Issued
    // Optional
    auth_time?:number  // When authed
    nonce?:string
    acr?:string  // Auth context class ref
    amr?:string[]  // Auth methods ref
    azp?:string  // Auth party
    // Standard extras (only relevant included)
    email?:string
    email_verified?:boolean
    name?:string
}


interface InternalData {
    // Added by AppAuth
    code_verifier:string
    // Custom
    issuer:OAuthIssuer
    meta:Record<string, any>
}


interface PretaskMeta {
    task:TaskStartArgs,
    oauth_id:string,
}


interface AuthCompletion<Meta=Record<string, any>> {
    auth:{
        issuer:OAuthIssuer,
        issuer_config:Record<string, any>,
        issuer_id:string,
        email:string,
        name:string,
        scope_sets:ScopeSet[]
        token_refresh:string,
        token_access:string,
        token_access_expires:Date,
    }
    meta:Meta
}


// CONSTANTS


const REDIRECT_PORT = 44932
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/oauth`

export const OAUTH_SUPPORTED = {
    google: {
        endpoint: 'https://accounts.google.com/',
        client_id: '1063868460974-iq39c1ajf4he8gn0d1d4s9snv9pkhqv3.apps.googleusercontent.com',
        // SECURITY Google for some reason requires client_secret even for Desktop apps
        // They state it can't/doesn't need to be confidential, and will be in compiled app
        // See https://stackoverflow.com/questions/59416326/
        client_secret: process.env.VUE_APP_OAUTH_SECRET_GOOGLE,
        scopes: {
            email_send: ['https://www.googleapis.com/auth/gmail.send'],
            contacts: ['https://www.googleapis.com/auth/contacts'],
        },
    },
    microsoft: {
        endpoint: 'https://login.microsoftonline.com/common/v2.0',
        client_id: '9900ba50-c70b-44dd-ac0c-335cd924e865',
        scopes: {
            email_send: ['https://graph.microsoft.com/SMTP.Send'],
            contacts: ['https://graph.microsoft.com/Contacts.ReadWrite'],
        },
    },
}


// LOW LEVEL (no access to db etc)


class CustomQueryStringUtils extends appauth.BasicQueryStringUtils {
    /* Override `parse` method to ignore `useHash` and parse search part instead
        Requests can specify whether to store params in query or hash upon redirect
        AppAuth defaults to parsing the hash for security (e.g. avoid server all together)
        Since Stello runs its own server it's a non-issue, and the hash is not retrievable otherwise
    */
    parse(input:appauth.LocationLike, useHash?:boolean){
        return this.parseQueryString(input.search)
    }
}


async function oauth_authorize_init(issuer:OAuthIssuer, scope_sets:string[],
        meta:Record<string, any>={}, email?:string):Promise<void>{
    // Authenticate with given issuer using OAuth2

    // Get issuer config
    const issuer_config = OAUTH_SUPPORTED[issuer]

    // Work out what scopes are required
    // NOTE email always required so user can identify the account in the UI
    // NOTE `email` is an alias for `https://www.googleapis.com/auth/userinfo.email` in Google
    const scopes = ['openid', 'email']
    for (const set of scope_sets){
        scopes.push(...issuer_config.scopes[set])
    }

    // Fetch the openid config
    const auth_config = await appauth.AuthorizationServiceConfiguration.fetchFromIssuer(
        issuer_config.endpoint, new appauth.FetchRequestor())

    // Init auth request by opening issuer's URL (which will then redirect to own local server)
    const auth_handler = new appauth.RedirectRequestHandler()
    auth_handler.performAuthorizationRequest(auth_config, new appauth.AuthorizationRequest({
        response_type: 'code',
        client_id: issuer_config.client_id,
        redirect_uri: REDIRECT_URI,
        scope: scopes.join(' '),
        extras: {
            login_hint: email,  // Auto-select/fill correct address if known
            prompt: email ? 'consent' : 'select_account',  // Ask which account if adding a new one
        },
        // Add data that's needed in complete step but stored securely internally
        internal: {issuer, meta} as any,  // AppAuth's type requires strings, but can take anything
    }))
}


async function oauth_authorize_complete(url:string):Promise<AuthCompletion>{
    // Extract response from redirect url and get first tokens with it

    // Manually extract the service config from storage so don't need to request again
    const auth_handle_key = self.localStorage.getItem('appauth_current_authorization_request')
    if (!auth_handle_key){
        throw new Error("No pending auth request")
    }
    const issuer_config_json =
        self.localStorage.getItem(`${auth_handle_key}_appauth_authorization_service_configuration`)
    const issuer_config = new AuthorizationServiceConfiguration(JSON.parse(issuer_config_json))

    // Give redirect handler what it needs, as if was actually just redirected (as it expects)
    const loc = new URL(url) as unknown as appauth.LocationLike
    const auth_handler = new appauth.RedirectRequestHandler(
        undefined, new CustomQueryStringUtils(), loc)

    // Create a new notifier for the handler so can later listen to auth completions from it
    const auth_notifier = new appauth.AuthorizationNotifier()
    auth_handler.setAuthorizationNotifier(auth_notifier)

    // Wait on a promise that will resolve when handler has completed processing the authorization
    const [auth_request, auth_resp] = await new Promise
            <[appauth.AuthorizationRequest, appauth.AuthorizationResponse]>((resolve, reject) => {
        auth_notifier.setAuthorizationListener((request, response, error) => {
            error ? reject(error) : resolve([request, response])
        })
        auth_handler.completeAuthorizationRequestIfPossible()
    })

    // Extract issuer from internal data
    const internal = auth_request.internal as unknown as InternalData
    const issuer = internal.issuer

    // Use the auth code to get tokens
    const token_handler = new appauth.BaseTokenRequestHandler(new appauth.FetchRequestor())
    let token_resp:appauth.TokenResponse
    try {
        token_resp = await token_handler.performTokenRequest(
            issuer_config,
            new appauth.TokenRequest({
                grant_type: 'authorization_code',
                client_id: auth_request.clientId,
                code: auth_resp.code,
                redirect_uri: REDIRECT_URI,
                extras: {
                    // SECURITY Supports PKCE to prevent auth being stolen during non-https redirect
                    code_verifier: internal.code_verifier,  // Value auto-created by AppAuth
                    // @ts-ignore Client secret may not be required
                    client_secret: OAUTH_SUPPORTED[issuer].client_secret,
                },
            }),
        )
    } catch (error){
        // Distinguish between network and other errors
        if (error instanceof TypeError){
            throw new MustReconnect()  // Underlying fetch call throws TypeError when can't connect
        }
        throw error
    }

    // Extract identity info from id token
    // SECURITY Don't need to verify the JWT signature since got straight from issuer over HTTPS
    const id_info:IDToken = JSON.parse(atob(token_resp.idToken.split('.')[1]))

    // Determine which scope sets have been granted
    const granted_scopes = token_resp.scope.split(' ')
    const granted_scope_sets = []
    for (const [scope_set, scope_set_scopes] of Object.entries(OAUTH_SUPPORTED[issuer].scopes)){
        if (scope_set_scopes.every(scope => granted_scopes.includes(scope))){
            granted_scope_sets.push(scope_set)
        }
    }

    // Return all relevant data
    return {
        auth: {
            issuer,
            issuer_config,
            issuer_id: id_info.sub,
            email: id_info.email,
            name: id_info.name,
            scope_sets: granted_scope_sets,
            token_refresh: token_resp.refreshToken,
            token_access: token_resp.accessToken,
            token_access_expires: new Date((token_resp.issuedAt + token_resp.expiresIn) * 1000),
        },
        meta: internal.meta as unknown as Record<string, any>,
    }
}


// PRETASK FUNCTIONS (getting auth for tasks that need it)


export async function oauth_pretask_new_usage(task_name:'contacts_oauth_setup'|'email_oauth_setup',
    extra_params:string[], issuer:OAuthIssuer, email?:string):Promise<void>{
    // Setup a new usage of an oauth, either using an existing auth or a new one
    // NOTE The chosen oauth's id will be passed as the first parameter when executing the task

    // Auto-detect the scope set required for the task
    const scope_set = scope_set_for_task(task_name)

    // Init array for which scope sets will be requested
    // NOTE May add existing (if any) for issuers that don't support incremental grants
    const final_scope_sets = [scope_set]

    // Get existing auths for this issuer
    let existing = (await self._db.oauths.list()).filter(oauth => oauth.issuer === issuer)
    if (task_name === 'contacts_oauth_setup'){
        // Cannot have multiple syncs for one oauth (unlike multiple profiles for same email)
        existing = existing.filter(o => !o.contacts_sync)
    }

    // If account not identifiable via email, but do have existing for this issuer, check with user
    // WARN If don't check and issuer doesn't support incremental grants, could lose existing scopes
    if (!email && existing.length){
        // User's desired account may already be present so ask them if it is
        const choice:OAuth = await self._store.dispatch('show_dialog', {
            component: DialogOAuthExisting,
            props: {
                oauths: existing,
            },
        })
        if (choice === undefined){
            return  // Cancel auth entirely as user changed their mind
        }
        if (choice !== null){
            // User selected an existing account, so update email so that following check will match
            email = choice.email
        }
    }

    // If email provided/detected, check if any existing auths match it
    if (email){
        const matching_auth = existing.find(oauth => oauth.email === email)
        if (matching_auth){
            // Matching auth exists, so use it's id for task's first param
            const task_args:[string, string[]] = [task_name, [matching_auth.id, ...extra_params]]
            // If existing scope sets already includes requested then can reuse existing auth
            if (matching_auth.scope_sets.includes(scope_set)){
                // No new scopes are being requested so skip reauthorization
                // WARN Assumes existing auth is still valid (if not, can handle via failed tasks)
                task_manager.start(...task_args)
            } else {
                // New scopes are being requested
                oauth_pretask_reauth(task_args, matching_auth)
            }
            // Have handled already, so return
            return
        }
    }

    // Pass task params for use once auth'd, but set oauth_id to null to insert once known
    const meta:PretaskMeta = {task: [task_name, extra_params], oauth_id: null}
    await oauth_authorize_init(issuer, final_scope_sets, meta, email)
}


export async function oauth_pretask_reauth(task:TaskStartArgs, oauth:OAuth):Promise<void>{
    // Reauth an existing auth, because it expired, was revoked, or needs more permissions

    // Detect task's required scope set
    // NOTE `scope_set_for_task()` important when referred from `oauth_pretask_new_usage()`
    const scope_sets = [scope_set_for_task(task[0])]

    // Detect scopes needed for existing usages
    // WARN Important as some issuer's (like Google) don't support incremental grants and would
    //      revoke access to the previously granted permissions
    if (oauth.contacts_sync && !scope_sets.includes('contacts')){
        scope_sets.push('contacts')
    }
    if (!scope_sets.includes('email_send')){
        for (const profile of await self._db.profiles.list()){
            if (profile.smtp.oauth === oauth.id){
                scope_sets.push('email_send')
                break
            }
        }
    }

    // Pass on task and oauth's id for use in post-auth
    const meta:PretaskMeta = {task, oauth_id: oauth.id}
    await oauth_authorize_init(oauth.issuer, scope_sets, meta, oauth.email)
}


export async function oauth_pretask_process(url:string):Promise<void>{
    // Process a url redirect from an issuer by storing the new auth and then executing the task

    // Process url
    const {auth, meta} = await oauth_authorize_complete(url) as AuthCompletion<PretaskMeta>

    // See if existing auth exists for the auth'd account
    const existing = await self._db.oauths.get_by_issuer_id(auth.issuer, auth.issuer_id)

    // Either update existing auth, or create new one
    let oauth_instance:OAuth
    if (existing){
        // TODO This could potentially revoke previously held permissions
        //      Too complicated to deal with now, so just let those tasks fail next time they run
        oauth_instance = new OAuth({...existing, ...auth})
        self._db.oauths.set(oauth_instance)
    } else {
        oauth_instance = await self._db.oauths.create({
            ...auth,
            contacts_sync: false,  // Will set true later if task is `contacts_oauth_setup`
            contacts_sync_last: null,
            contacts_sync_token: null,
        })
    }

    // See if specific oauth account was expected
    if (meta.oauth_id){
        if (oauth_instance.id !== meta.oauth_id){
            // TODO Different account! (show dialog to choose to sync new contacts / change email)
            return
        }
    } else {
        // This must be a new usage task, so add the newly auth'd oauth's id as first param
        meta.task[1].unshift(oauth_instance.id)
    }

    // Start the task, which will make use of the new auth
    // NOTE Requested permissions may not have been granted, but let failed task UI handle that
    task_manager.start(...meta.task)
}


// POST-AUTH


export async function oauth_refresh(oauth:OAuth):Promise<void>{
    // Refresh oauth's access token
    const handler = new appauth.BaseTokenRequestHandler(new appauth.FetchRequestor())
    let token_resp:appauth.TokenResponse
    try {
        token_resp = await handler.performTokenRequest(
            oauth.issuer_config as appauth.AuthorizationServiceConfiguration,
            new appauth.TokenRequest({
                client_id: OAUTH_SUPPORTED[oauth.issuer].client_id,
                grant_type: 'refresh_token',
                refresh_token: oauth.token_refresh,
                redirect_uri: REDIRECT_URI,
                extras: {
                    // @ts-ignore Client secret may not be required
                    client_secret: OAUTH_SUPPORTED[oauth.issuer].client_secret,
                },
            }),
        )
    } catch (error){
        // Distinguish between normal and abnormal errors
        if (error instanceof TypeError){
            throw new MustReconnect()
        } else if (error instanceof appauth.AppAuthError){
            if (error.extras?.error === 'invalid_grant'){  // e.g. expired/revoked/etc
                // See https://tools.ietf.org/html/rfc6749#section-5.2
                throw new MustReauthenticate()
            }
        }
        throw error
    }
    oauth.token_access = token_resp.accessToken
    oauth.token_access_expires = new Date((token_resp.issuedAt + token_resp.expiresIn) * 1000)
    self._db.oauths.set(oauth)
}


export async function oauth_revoke(oauth:OAuth):Promise<void>{
    // Revoke own access to issuer when user requests it
    const handler = new appauth.BaseTokenRequestHandler(new appauth.FetchRequestor())
    try {
        await handler.performRevokeTokenRequest(
            oauth.issuer_config as appauth.AuthorizationServiceConfiguration,
            new appauth.RevokeTokenRequest({
                client_id: OAUTH_SUPPORTED[oauth.issuer].client_id,
                // @ts-ignore Client secret may not be required
                client_secret: OAUTH_SUPPORTED[oauth.issuer].client_secret,
                token: oauth.token_access,
            }),
        )
    } catch (error){
        // Distingush between normal and abnormal errors
        if (error instanceof TypeError){  // Likely thrown by fetch
            throw new MustReconnect()
        } else if (error instanceof appauth.AppAuthError){
            if (error.extras?.error === 'invalid_grant'){  // e.g. expired/revoked/etc
                return  // If not authenticated then job already done!
            }
        }
        throw error
    }
}


export async function oauth_revoke_if_obsolete(oauth:OAuth):Promise<void>{
    // Check if an oauth is obsolete and, if so, revoke and delete from db

    // If using for contacts sync, keep
    if (oauth.contacts_sync){
        return
    }

    // If used for email sending, keep
    const profiles = await self._db.profiles.list()
    if (profiles.some(profile => profile.smtp_settings.oauth === oauth.id)){
        return
    }

    // Revoke auth, but ignore failure as too complicated to resolve, and deleting tokens anyway
    drop(oauth_revoke(oauth))

    // Remove from db
    await self._db.oauths.remove(oauth.id)
}


export async function oauth_request(oauth:OAuth, url:string, params?:Record<string,string|string[]>,
        method:string='GET', body?:any):Promise<Record<string, any>>{
    // Request a resource using OAuth2

    // Add params to url if any
    if (params){
        // Convert params object to array of arrays so that multiple values per key are supported
        const params_array:[string, string][] = []
        for (let [k, v] of Object.entries(params)){
            if (!Array.isArray(v)){
                v = [v]
            }
            params_array.push(...v.map(i => [k, i] as [string, string]))
        }
        url = `${url}?${new URLSearchParams(params_array)}`
    }

    // Refresh access token if it has/will expire
    if (oauth.token_access_expires <= new Date()){
        await oauth_refresh(oauth)
    }

    // Convert body to JSON string if an object
    if (typeof body === 'object'){
        body = JSON.stringify(body)
    }

    // Send the request
    let resp:Response
    try {
        resp = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${oauth.token_access}`,
            },
            body,
        })
    } catch (error){
        throw new MustReconnect()
    }

    // Return just the data
    if (resp.ok){
        return resp.json()
    }

    // Handle errors
    if ([401, 403].includes(resp.status)){  // Google returns 403 for scope issues
        throw new MustReauthenticate()
    } else if (resp.status === 410){  // Gone
        throw new MustRecover()  // e.g. Google sync token expired
    }
    throw new Error(await resp.text())
}


// HELPERS


export function scope_set_for_task(task_name:string):ScopeSet{
    // Return the scope set required for given task name
    if (task_name.startsWith('contacts_')){
        return 'contacts'
    } else if (task_name.startsWith('email_')){
        return 'email_send'
    }
    throw new Error("Shouldn't be possible")
}

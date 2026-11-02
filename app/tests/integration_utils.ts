
// Shared helpers for integration tests that run against real AWS services in the sandbox account

import {readFileSync} from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'

import {STS} from '@aws-sdk/client-sts'
import {CognitoIdentityProvider} from '@aws-sdk/client-cognito-identity-provider'
import {AuthorizationServiceConfiguration, FetchRequestor} from '@openid/appauth'

import {buffer_to_url64, string_to_utf8, utf8_to_string} from '@/services/utils/coding'
import {encrypt_asym, export_key, generate_token, import_key_asym}
    from '@/services/utils/crypt'
import {sleep} from '@/services/utils/async'
import {create_account} from '@/services/hosts/gracious_user'
import {Task} from '@/services/tasks/tasks'
import {OAUTH_SUPPORTED} from '@/services/tasks/oauth'
import {external_encrypt} from '@/services/misc/external_crypt'
import {jwt_to_object} from '@/services/utils/coding'
import type {OAuth} from '@/services/database/oauths'
import type {Database} from '@/services/database/database'
import type {HostCredentialsAws} from '@/services/hosts/aws_common'
import type {Profile} from '@/services/database/profiles'
import type {untar} from '@/services/misc'
import type {MemoryNative} from './unit_utils'


// Prefix for every resource created by integration tests (used for cleanup)
export const TEST_PREFIX = 'zz-it'


export function sandbox_credentials():HostCredentialsAws{
    // Get credentials for sandbox account from environment (set by .bin/audit_integration)
    const {AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN} = process.env
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY){
        throw new Error("AWS credentials for the sandbox account must be set in env")
    }
    return {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
        ...(AWS_SESSION_TOKEN ? {sessionToken: AWS_SESSION_TOKEN} : {}),
    }
}


export async function assert_sandbox(credentials:HostCredentialsAws):Promise<void>{
    // Refuse to run unless credentials belong to the sandbox account
    // SECURITY Prevents tests creating/deleting resources in a shared or production account
    const expected = process.env['STELLO_SANDBOX_ACCOUNT_ID']
    if (!expected){
        throw new Error("STELLO_SANDBOX_ACCOUNT_ID must be set in env")
    }
    const sts = new STS({credentials, region: 'us-west-2'})
    const account = (await sts.getCallerIdentity({})).Account
    if (account !== expected){
        throw new Error(`Credentials are for account ${account ?? '?'}, not the sandbox`)
    }
}


export function unique_name():string{
    // Generate a name valid as both a hosted username and a bucket name
    return `${TEST_PREFIX}-${generate_token().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}`
}


export function load_static_files(native:MemoryNative):void{
    // Make built displayer and responder available to code that deploys them
    const static_dir = fileURLToPath(new URL('../static', import.meta.url))
    for (const name of ['displayer.tar', 'responder_aws.zip', 'default_invite_image.jpg']){
        // NOTE Copied since a Buffer's underlying ArrayBuffer may be a larger shared pool
        const data = readFileSync(path.join(static_dir, name))
        native.app_files.set(name, Uint8Array.from(data).buffer)
    }
}


export async function create_hosted_profile(db:Database, username:string):Promise<Profile>{
    // Create a real hosted account and a profile that uses it
    const account = await create_account(username, 'integration@example.com', 'c')
    const profile = await db.profiles.create()
    profile.setup_step = null
    profile.email = 'integration@example.com'
    profile.options.notify_mode = 'none'  // Don't email from the responder
    profile.host = {
        cloud: 'gracious',
        plan: 'c',
        username,
        password: account.password,
        federated_id: account.federated_id,
        id_token: account.id_token,
        id_token_exires: account.id_token_expires,
    }
    await db.profiles.set(profile)
    return profile
}


export async function delete_hosted_account(db:Database, profile:Profile|undefined,
        admin:HostCredentialsAws, username:string):Promise<void>{
    // Delete everything a hosted test user stored, then the Cognito user itself
    try {
        if (profile){
            const storage = await db.new_host_user(profile)
            await storage.delete_services(new Task('', [], []))
        }
    } finally {
        // Always delete Cognito user so test accounts don't accumulate
        const env = import.meta.env
        const user_pools = new CognitoIdentityProvider({credentials: admin,
            region: env.VITE_HOSTED_REGION})
        await user_pools.adminDeleteUser({UserPoolId: env.VITE_HOSTED_USER_POOL,
            Username: username})
            .catch(() => undefined)  // May not have been created if an earlier test failed
    }
}


export async function retry<T>(fn:()=>Promise<T>, attempts=10, delay=3000):Promise<T>{
    // Retry fn to allow for eventual consistency of AWS services (e.g. new IAM keys)
    for (let attempt = 1;; attempt++){
        try {
            return await fn()
        } catch (error){
            if (attempt >= attempts){
                throw error
            }
            await sleep(delay)
        }
    }
}


export async function send_response(profile:Profile, type:string,
        encrypted:Record<string, unknown>, origin=`https://${profile.view_domain}`)
        :Promise<Response>{
    // Send a response to the responder the same way the displayer does (see displayer responses.ts)
    const config_secret = buffer_to_url64(await export_key(profile.host_state.shared_secret))
    // NOTE Displayer imports the exported public key (which gives it encrypt usage)
    const resp_key_public = await import_key_asym(
        await export_key(profile.host_state.resp_key.publicKey))
    const body = {
        config_secret,
        encrypted: await encrypt_asym(
            string_to_utf8(JSON.stringify({...encrypted, user_agent: 'integration-test'})),
            resp_key_public,
        ),
    }
    return fetch(`${profile.api}responder/${type}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Origin: origin},
        body: JSON.stringify(body),
    })
}


export async function untar_node(tar_file:ArrayBuffer):ReturnType<typeof untar>{
    // Extract a ustar archive in-process (app's untar relies on a web worker unavailable in node)
    const files:Awaited<ReturnType<typeof untar>> = []
    const bytes = new Uint8Array(tar_file)

    // Helper for reading a null-terminated string field from a header
    const field = (start:number, length:number) =>
        utf8_to_string(bytes.slice(start, start + length).buffer).replace(/\0.*$/s, '')

    // Each entry is a 512 byte header followed by its data padded to a multiple of 512
    for (let offset = 0; offset + 512 <= bytes.length;){
        const name = field(offset, 100)
        if (!name){
            break  // Archive ends with empty blocks
        }
        const prefix = field(offset + 345, 155)
        const size = parseInt(field(offset + 124, 12).trim() || '0', 8)
        files.push({
            name: prefix ? `${prefix}/${name}` : name,
            type: field(offset + 156, 1),
            buffer: bytes.slice(offset + 512, offset + 512 + size).buffer,
        })
        offset += 512 + Math.ceil(size / 512) * 512
    }
    return files
}


export function provider_refresh_token(issuer:'google'|'microsoft'):string|undefined{
    // Refresh token for a test account (saved by .bin/integration_oauth.mts), if available
    return process.env[`STELLO_IT_${issuer.toUpperCase()}_REFRESH`] || undefined
}


export async function create_provider_oauth(db:Database, issuer:'google'|'microsoft')
        :Promise<OAuth>{
    // Create an oauth record for a test account as the app would after the user signed in
    // NOTE Access token is left expired so the app's own refresh logic gets exercised
    const refresh_token = provider_refresh_token(issuer)!
    const issuer_settings = OAUTH_SUPPORTED[issuer]
    const issuer_config = await AuthorizationServiceConfiguration.fetchFromIssuer(
        issuer_settings.endpoint, new FetchRequestor())

    // Get the account's identity (as the app gets from the id token when signing in)
    const resp = await fetch(issuer_config.tokenEndpoint, {method: 'POST',
        body: new URLSearchParams({grant_type: 'refresh_token', refresh_token,
            client_id: issuer_settings.client_id,
            ...(issuer_settings.client_secret
                ? {client_secret: issuer_settings.client_secret} : {})})})
    const tokens = await resp.json() as {id_token?:string, error_description?:string}
    if (!tokens.id_token){
        throw new Error(`Refresh failed (rerun .bin/integration_oauth.mts ${issuer}): `
            + (tokens.error_description ?? String(resp.status)))
    }
    const id_info = jwt_to_object(tokens.id_token) as {sub:string, email?:string}

    return db.oauths.create({
        issuer,
        issuer_id: id_info.sub,
        issuer_config: issuer_config as unknown as Record<string, unknown>,
        email: id_info.email ?? '',
        name: "Integration Test",
        scope_sets: issuer === 'google' ? ['email_send', 'contacts', 'storage']
            : ['email_send', 'contacts'],
        token_refresh: await external_encrypt(refresh_token),
        token_access: await external_encrypt(''),
        token_access_expires: new Date(0),
        contacts_sync: true,
        contacts_sync_last: null,
        contacts_sync_token: null,
    } as unknown as Parameters<Database['oauths']['create']>[0])
}

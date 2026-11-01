
// Integration tests for Gracious hosted storage against the real sandbox stack (stello-hosted-*)

import {afterAll, beforeAll, describe, expect, test} from 'vitest'
import {ListObjectsV2Command, PutObjectCommand} from '@aws-sdk/client-s3'

import {setup_globals} from '@/../tests/unit_utils'
import {assert_sandbox, create_hosted_profile, delete_hosted_account, sandbox_credentials,
    send_response, unique_name} from '@/../tests/integration_utils'
import {HostUserGracious, username_available} from './gracious_user'
import {configs_update} from '../tasks/configs'
import {responses_receive} from '../tasks/responses'
import {Task} from '../tasks/tasks'
import {decrypt_sym, export_key, import_key_sym} from '../utils/crypt'
import {utf8_to_string} from '../utils/coding'
import type {Database} from '../database/database'
import type {Profile} from '../database/profiles'
import type {HostCredentialsAws} from './aws_common'


const env = import.meta.env
const msgs_url = `https://${env.VITE_HOSTED_BUCKET}.s3.${env.VITE_HOSTED_REGION}.amazonaws.com/`

let admin:HostCredentialsAws
let db:Database
let profile:Profile|undefined
const username = unique_name()


beforeAll(async () => {
    // Confirm running against sandbox before creating anything
    admin = sandbox_credentials()
    await assert_sandbox(admin)
    ;({db} = await setup_globals())
})


afterAll(async () => {
    // Delete everything the test user stored, then the Cognito user itself
    await delete_hosted_account(db, profile, admin, username)
})


// Get storage for the test user's profile (fresh AWS credentials each time)
async function get_storage():Promise<HostUserGracious>{
    return await db.new_host_user(profile!) as HostUserGracious
}


describe('hosted account', () => {

    // Username checks go through API Gateway, Lambda and Cognito
    test('new username is available', async () => {
        expect(await username_available(username)).toEqual({valid: true, available: true})
    })

    // Account creation returns working login and federated identity
    test('account can be created and used to get credentials', async () => {
        profile = await create_hosted_profile(db, username)
        expect(await username_available(username)).toEqual({valid: true, available: false})
        expect((await get_storage()).generated.credentials.sessionToken).toBeTruthy()
    })
})


describe('hosted storage', () => {

    // Configs are uploaded and the displayer can fetch them cross-origin
    test('configs upload and are readable by displayer', async () => {
        await configs_update(new Task('configs_update', [profile!.id], []))
        profile = (await db.profiles.get(profile!.id))!
        expect(profile.host_state.displayer_config_uploaded).toBe(true)
        expect(profile.host_state.responder_config_uploaded).toBe(true)

        const origin = `https://${profile.view_domain}`
        const resp = await fetch(`${msgs_url}config/${username}/config`, {headers: {Origin: origin}})
        expect(resp.status).toBe(200)
        expect(resp.headers.get('access-control-allow-origin')).toBe(origin)
        // NOTE shared_secret is encrypt-only so re-import it for decrypting
        const key = await import_key_sym(await export_key(profile.host_state.shared_secret))
        const decrypted = await decrypt_sym(await resp.arrayBuffer(), key)
        const config = JSON.parse(utf8_to_string(decrypted)) as Record<string, unknown>
        expect(config['responder']).toBe(`${profile.api}responder/`)
    })

    // Message files can be uploaded, listed, publicly read and deleted
    test('message files round trip', async () => {
        const storage = await get_storage()
        const data = new Uint8Array([1, 2, 3, 4]).buffer
        await storage.upload_file('copies/integration', data, 1)
        expect(await storage.list_files('copies/')).toContain('copies/integration')
        const resp = await fetch(`${msgs_url}messages/${username}/copies/integration`)
        expect(resp.status).toBe(200)
        expect(new Uint8Array(await resp.arrayBuffer())).toEqual(new Uint8Array(data))
        await storage.delete_file('copies/integration')
        expect(await storage.list_files('copies/')).not.toContain('copies/integration')
    })

    // SECURITY Users must only be able to access their own prefixes in the shared buckets
    test('cannot write or list other users\' storage', async () => {
        const storage = await get_storage()
        const other = `${username}-other`
        await expect(storage.s3.send(new PutObjectCommand({Bucket: storage.bucket,
            Key: `messages/${other}/x`, Body: 'x'}))).rejects.toThrow()
        await expect(storage.s3.send(new PutObjectCommand({Bucket: storage.bucket,
            Key: `config/${other}/config`, Body: 'x'}))).rejects.toThrow()
        await expect(storage.s3.send(new ListObjectsV2Command({
            Bucket: storage._bucket_resp_id, Prefix: `responses/${other}/`}))).rejects.toThrow()
    })
})


describe('hosted responder', () => {

    // A reply sent like the displayer does is stored, then received and decrypted by the app
    test('reply is delivered to the app', async () => {
        const resp = await send_response(profile!, 'reply', {resp_token: 'integration',
            section_id: null, subsection_id: null, content: "Hello from integration test"})
        expect(resp.status).toBe(200)

        await responses_receive(new Task('responses_receive', [], []))
        const replies = await db.replies.list()
        expect(replies.map(reply => reply.content)).toEqual(["Hello from integration test"])
        expect(await (await get_storage()).list_responses()).toEqual([])
    })

    // SECURITY Responses from other sites are refused
    test('responder rejects foreign origins', async () => {
        const resp = await send_response(profile!, 'reply', {resp_token: 'x', section_id: null,
            subsection_id: null, content: "x"}, 'https://evil.example.com')
        expect(resp.status).toBe(403)
    })
})

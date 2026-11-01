
// Integration tests for self-hosted AWS storage
// Creates a throwaway storage in the sandbox account, uses it like the app does, then deletes it

import {afterAll, beforeAll, describe, expect, test, vi} from 'vitest'
import {GetBucketTaggingCommand} from '@aws-sdk/client-s3'

import {setup_globals} from '@/../tests/unit_utils'
import {assert_sandbox, load_static_files, retry, sandbox_credentials, send_response, unique_name,
    untar_node} from '@/../tests/integration_utils'
import * as misc from '@/services/misc'
import {HostManagerAws} from './aws_manager'
import {HostUserAws} from './aws_user'
import {HOST_STORAGE_VERSION} from './common'
import {configs_update} from '../tasks/configs'
import {hosts_manager_delete, hosts_manager_update} from '../tasks/hosts'
import {responses_receive} from '../tasks/responses'
import {Task} from '../tasks/tasks'
import type {Database} from '../database/database'
import type {Profile} from '../database/profiles'
import type {HostCredentialsAws, HostStorageGeneratedAws} from './aws_common'


const region = 'us-west-2'
const bucket = unique_name()

let admin:HostCredentialsAws
let manager:HostManagerAws
let db:Database
let profile:Profile
let generated:HostStorageGeneratedAws|undefined
let deleted = false


beforeAll(async () => {
    // Confirm running against sandbox before creating anything
    admin = sandbox_credentials()
    await assert_sandbox(admin)
    manager = new HostManagerAws(admin)
    const globals = await setup_globals()
    db = globals.db
    load_static_files(globals.native)
    vi.spyOn(misc, 'untar').mockImplementation(untar_node)
})


afterAll(async () => {
    // Ensure storage is deleted even if a test failed part way
    if (generated && !deleted){
        await manager.delete_storage(new Task('', [], []), bucket, region)
    }
})


// Storage client using manager credentials (has access to everything)
function manager_storage():HostUserAws{
    return new HostUserAws({credentials: admin}, bucket, region, null)
}


describe('self-hosted storage setup', () => {

    // New random bucket names should be available
    test('bucket name is available', async () => {
        // NOTE Bucket deletion is eventually consistent so name may take a while to be released
        await retry(async () => {
            if (!await manager.bucket_available(bucket)){
                throw new Error("Bucket name not yet released")
            }
        }, 40)
    })

    // Manager creates bucket, IAM user/policies, API and returns user credentials
    test('manager creates storage', async () => {
        generated = await manager.new_storage(bucket, region)
        expect(generated.credentials.accessKeyId).toBeTruthy()
        expect(generated.api_id).toBeTruthy()
    })

    // Deploys all services (lambda, gateway, sns, displayer) and marks the version
    test('services deploy', async () => {
        await hosts_manager_update(
            new Task('hosts_manager_update', ['aws', bucket], [region, admin]))
        const tags = await manager_storage().s3.send(new GetBucketTaggingCommand({Bucket: bucket}))
        expect(tags.TagSet).toContainEqual({Key: 'stello-version',
            Value: `${HOST_STORAGE_VERSION}`})
    })

    // Profile using the storage user's own credentials can upload configs
    test('profile can upload configs with storage credentials', async () => {
        profile = await db.profiles.create()
        profile.setup_step = null
        profile.email = 'integration@example.com'
        profile.options.notify_mode = 'none'  // Don't email from the responder
        profile.host = {cloud: 'aws', bucket, region, generated: generated!}
        profile.host_state.version = HOST_STORAGE_VERSION
        await db.profiles.set(profile)

        // NOTE New access keys can take some seconds to start working
        await retry(() => configs_update(new Task('configs_update', [profile.id], [])))
        profile = (await db.profiles.get(profile.id))!
        expect(profile.host_state.displayer_config_uploaded).toBe(true)
        expect(profile.host_state.responder_config_uploaded).toBe(true)
    })

    // Displayer is publicly served from the bucket
    test('displayer is served publicly', async () => {
        const resp = await fetch(profile.view_displayer)
        expect(resp.status).toBe(200)
        expect(resp.headers.get('content-type')).toContain('text/html')
    })
})


describe('self-hosted responder', () => {

    // A reply sent like the displayer does is stored, then received and decrypted by the app
    test('reply is delivered to the app', async () => {
        // NOTE Lambda may take a moment to become active after deployment
        const resp = await retry(async () => {
            const resp = await send_response(profile, 'reply', {resp_token: 'integration',
                section_id: null, subsection_id: null, content: "Hello from integration test"})
            if (resp.status !== 200){
                throw new Error(`Responder returned ${resp.status}`)
            }
            return resp
        })
        expect(resp.status).toBe(200)

        await responses_receive(new Task('responses_receive', [], []))
        const replies = await db.replies.list()
        expect(replies.map(reply => reply.content)).toEqual(["Hello from integration test"])
        const storage = await db.new_host_user(profile)
        expect(await storage.list_responses()).toEqual([])
    })

    // SECURITY Responses from other sites are refused
    test('responder rejects foreign origins', async () => {
        const resp = await send_response(profile, 'reply', {resp_token: 'x', section_id: null,
            subsection_id: null, content: "x"}, 'https://evil.example.com')
        expect(resp.status).toBe(403)
    })
})


describe('self-hosted storage deletion', () => {

    // Deleting storage removes all of its services and the bucket name becomes available again
    test('manager deletes storage completely', async () => {
        await hosts_manager_delete(
            new Task('hosts_manager_delete', ['aws', bucket], [region, admin]))
        deleted = true
        // NOTE Bucket deletion is eventually consistent so name may take a while to be released
        await retry(async () => {
            if (!await manager.bucket_available(bucket)){
                throw new Error("Bucket name not yet released")
            }
        }, 40)
        expect((await manager.list_storages()).map(storage => storage.bucket)).not.toContain(bucket)
    })
})


// Integration tests for upgrading a long-lived self-hosted storage created by an older version
// The storage user's IAM policy is set only when a storage is created, so existing users keep the
// policy of whichever version created their storage. Newer versions must still be able to update
// services using those old permissions, which this storage checks. It was created in v1.9.15's
// time with v1.9.15's IAM policy (aws_manager.ts was unchanged then).
// WARN Never delete/recreate this storage or call new_storage() for it, as that would replace its
//      old IAM policy with the current one (keys are created directly via IAM instead)

import {afterAll, beforeAll, describe, expect, test, vi} from 'vitest'
import {IAM} from '@aws-sdk/client-iam'

import {setup_globals} from '@/../tests/unit_utils'
import {assert_sandbox, load_static_files, retry, sandbox_credentials, send_response, untar_node}
    from '@/../tests/integration_utils'
import * as misc from '@/services/misc'
import {HostManagerAws} from './aws_manager'
import {HOST_STORAGE_VERSION} from './common'
import {configs_update} from '../tasks/configs'
import {hosts_manager_update, hosts_storage_update} from '../tasks/hosts'
import {responses_receive} from '../tasks/responses'
import {Task} from '../tasks/tasks'
import type {Database} from '../database/database'
import type {Profile} from '../database/profiles'
import type {HostCredentialsAws} from './aws_common'


const region = 'us-west-2'

let admin:HostCredentialsAws
let manager:HostManagerAws
let iam:IAM
let db:Database
let bucket:string
let user_name:string
let access_key_id:string|undefined


beforeAll(async () => {
    // Confirm running against sandbox before doing anything
    admin = sandbox_credentials()
    await assert_sandbox(admin)
    manager = new HostManagerAws(admin)
    iam = new IAM({credentials: admin, region})
    const globals = await setup_globals()
    db = globals.db
    load_static_files(globals.native)
    vi.spyOn(misc, 'untar').mockImplementation(untar_node)

    // Name includes account id so it's globally unique
    bucket = `zz-compat-${await manager._get_account_id()}`
    user_name = `stello-${bucket}`

    // One-off creation (only if explicitly requested, since it must be done by an old version)
    if (process.env['STELLO_CREATE_LEGACY_STORAGE']){
        await manager.new_storage(bucket, region)
        await hosts_manager_update(
            new Task('hosts_manager_update', ['aws', bucket], [region, admin]))
    }
})


afterAll(async () => {
    // Remove the key created for this run
    if (access_key_id){
        await iam.deleteAccessKey({UserName: user_name, AccessKeyId: access_key_id})
    }
})


describe('self-hosted storage created by an old version', () => {

    let profile:Profile

    // Storage must still exist (recreating it would lose the old IAM policy being tested)
    test('legacy storage exists', async () => {
        const storages = await manager.list_storages()
        expect(storages.map(storage => storage.bucket), "Legacy storage missing -- see file docs")
            .toContain(bucket)
    })

    // New version updates services using the old storage user's own restricted credentials
    test('can be updated by this version with its own credentials', async () => {

        // Replace any leftover keys with a fresh one (IAM allows at most two per user)
        const existing = await iam.listAccessKeys({UserName: user_name})
        for (const key of existing.AccessKeyMetadata ?? []){
            await iam.deleteAccessKey({UserName: user_name, AccessKeyId: key.AccessKeyId})
        }
        const key = (await iam.createAccessKey({UserName: user_name})).AccessKey!
        access_key_id = key.AccessKeyId

        // Profile as an existing user would have it, but needing a services update
        profile = await db.profiles.create()
        profile.setup_step = null
        profile.email = 'integration@example.com'
        profile.options.notify_mode = 'none'  // Don't email from the responder
        profile.host = {cloud: 'aws', bucket, region, generated: {
            credentials: {accessKeyId: key.AccessKeyId!, secretAccessKey: key.SecretAccessKey!},
            api_id: await manager._get_api_id(bucket, region),
        }}
        profile.host_state.version = HOST_STORAGE_VERSION - 1
        await db.profiles.set(profile)

        // NOTE New access keys can take some seconds to start working
        await retry(() => hosts_storage_update(
            new Task('hosts_storage_update', [profile.id], [])))
        await configs_update(new Task('configs_update', [profile.id], []))
        profile = (await db.profiles.get(profile.id))!
        expect(profile.host_state.version).toBe(HOST_STORAGE_VERSION)
        expect(profile.configs_need_uploading).toBe(false)
    })

    // Updated services work end to end
    test('responder works after update', async () => {
        const resp = await retry(async () => {
            const resp = await send_response(profile, 'reply', {resp_token: 'legacy',
                section_id: null, subsection_id: null, content: "Hello legacy storage"})
            if (resp.status !== 200){
                throw new Error(`Responder returned ${resp.status}`)
            }
            return resp
        })
        expect(resp.status).toBe(200)
        await responses_receive(new Task('responses_receive', [], []))
        expect((await db.replies.list()).map(reply => reply.content))
            .toContain("Hello legacy storage")
    })
})

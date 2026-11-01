
// Integration tests for self-hosted AWS storage
// Creates a throwaway storage in the sandbox account, uses it like the app does, then deletes it

import {afterAll, beforeAll, describe, expect, test, vi} from 'vitest'
import {GetBucketTaggingCommand, ListObjectsV2Command} from '@aws-sdk/client-s3'
import {IAM} from '@aws-sdk/client-iam'

import {setup_globals} from '@/../tests/unit_utils'
import {assert_sandbox, load_static_files, retry, sandbox_credentials, send_response, unique_name,
    untar_node} from '@/../tests/integration_utils'
import {invite_urls, receive_replies, REPLY_TEXT, send_test_message, view_and_reply}
    from '@/../tests/integration_journey'
import * as misc from '@/services/misc'
import {HostManagerAws} from './aws_manager'
import {HostUserAws} from './aws_user'
import {HOST_STORAGE_VERSION} from './common'
import {configs_update} from '../tasks/configs'
import {hosts_manager_delete, hosts_manager_update, hosts_storage_update} from '../tasks/hosts'
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

    // App updates services with the storage user's own restricted credentials (e.g. new version)
    // SECURITY Confirms the user's IAM policy permits everything update_services does
    test('storage user can update its own services', async () => {
        await hosts_storage_update(new Task('hosts_storage_update', [profile.id], []))
        expect((await db.profiles.get(profile.id))!.host_state.version).toBe(HOST_STORAGE_VERSION)
    })

    // Displayer is publicly served from the bucket
    test('displayer is served publicly', async () => {
        const resp = await fetch(profile.view_displayer)
        expect(resp.status).toBe(200)
        expect(resp.headers.get('content-type')).toContain('text/html')
    })
})


describe('self-hosted storage user permissions', () => {
    // SECURITY The storage user's keys are stored in the app, so must not allow escalating access
    // NOTE Uses IAM's policy simulator so denied actions are evaluated without being attempted

    // Evaluate whether storage user is allowed to do the given action on the given resource
    async function user_allowed(action:string, resource:string,
            boundary?:string):Promise<boolean>{
        const account = await manager._get_account_id()
        const resp = await new IAM({credentials: admin, region}).simulatePrincipalPolicy({
            PolicySourceArn: `arn:aws:iam::${account}:user/stello/${region}/stello-${bucket}`,
            ActionNames: [action],
            ResourceArns: [resource],
            ContextEntries: boundary ? [{ContextKeyName: 'iam:PermissionsBoundary',
                ContextKeyType: 'string', ContextKeyValues: [boundary]}] : [],
        })
        return resp.EvaluationResults?.[0]?.EvalDecision === 'allowed'
    }

    // Get ARN of an IAM resource in the sandbox account
    async function iam_arn(path:string):Promise<string>{
        return `arn:aws:iam::${await manager._get_account_id()}:${path}`
    }

    // Lambda role can only be created with the permissions boundary attached
    test('can only create lambda role with boundary', async () => {
        const role = await iam_arn(`role/stello-${bucket}-lambda`)
        const boundary = await iam_arn(`policy/stello-${bucket}-lambda-boundary`)
        expect(await user_allowed('iam:CreateRole', role, boundary)).toBe(true)
        expect(await user_allowed('iam:CreateRole', role)).toBe(false)
        expect(await user_allowed('iam:CreateRole', role,
            'arn:aws:iam::aws:policy/AdministratorAccess')).toBe(false)
        expect(await user_allowed('iam:CreateRole', await iam_arn('role/other'), boundary))
            .toBe(false)
    })

    // Cannot pass other roles (e.g. to a lambda) or grant itself more permissions
    test('cannot escalate via IAM', async () => {
        const user = await iam_arn(`user/stello/${region}/stello-${bucket}`)
        expect(await user_allowed('iam:PassRole', await iam_arn('role/other'))).toBe(false)
        const self_escalations = ['iam:PutUserPolicy', 'iam:AttachUserPolicy',
            'iam:CreateAccessKey', 'iam:DeleteUserPermissionsBoundary']
        for (const action of self_escalations){
            expect(await user_allowed(action, user), action).toBe(false)
        }
        expect(await user_allowed('iam:CreatePolicyVersion',
            await iam_arn(`policy/stello-${bucket}-lambda-boundary`))).toBe(false)
    })

    // Full access to own resources only
    test('cannot access other resources in the account', async () => {
        const account = await manager._get_account_id()
        expect(await user_allowed('s3:PutObject', `arn:aws:s3:::${bucket}/x`)).toBe(true)
        expect(await user_allowed('s3:PutObject', 'arn:aws:s3:::other/x')).toBe(false)
        expect(await user_allowed('s3:ListBucket', 'arn:aws:s3:::other')).toBe(false)
        expect(await user_allowed('lambda:UpdateFunctionCode',
            `arn:aws:lambda:${region}:${account}:function:other`)).toBe(false)
        expect(await user_allowed('sns:Publish',
            `arn:aws:sns:${region}:${account}:other`)).toBe(false)

        // Confirm simulator matches reality with an actual (harmless) request
        const storage = await db.new_host_user(profile) as HostUserAws
        await expect(storage.s3.send(new ListObjectsV2Command({
            Bucket: import.meta.env.VITE_HOSTED_BUCKET}))).rejects.toMatchObject(
            {name: 'AccessDenied'})
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


describe('self-hosted send and view', () => {
    // Same journey as hosted, but displayer is served directly from S3 rather than CloudFront

    // App sends, recipient views and replies in a real browser, app receives the reply
    test('message can be sent, viewed and replied to', async () => {
        const {msg_id, invite} = await send_test_message(db, profile)
        const urls = invite_urls(invite)
        expect(urls.view.startsWith(`${profile.view_displayer}#`)).toBe(true)

        // Invite image served by the storage's own inviter API
        const resp = await fetch(urls.image)
        expect(resp.status).toBe(200)
        expect(resp.headers.get('content-type')).toBe('image/jpeg')

        expect(await view_and_reply(urls.view)).toContain("Integration message")
        const replies = await receive_replies(db, msg_id)
        expect(replies.map(reply => [reply.content, reply.contact_name]))
            .toEqual([[REPLY_TEXT, "Recipient"]])
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

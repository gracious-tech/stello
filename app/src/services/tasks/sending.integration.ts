
// Integration test of the main user journey against the real sandbox hosted stack:
// app sends a message, recipient opens invite link in a real browser, replies, app receives reply

import {afterAll, beforeAll, describe, expect, test} from 'vitest'

import {setup_globals} from '@/../tests/unit_utils'
import {assert_sandbox, create_hosted_profile, delete_hosted_account, load_static_files,
    sandbox_credentials, unique_name} from '@/../tests/integration_utils'
import {invite_urls, receive_replies, REPLY_TEXT, send_test_message, view_and_reply}
    from '@/../tests/integration_journey'
import type {Database} from '../database/database'
import type {Profile} from '../database/profiles'
import type {HostCredentialsAws} from '../hosts/aws_common'
import type {Email} from '../native/types'


const username = unique_name()

let admin:HostCredentialsAws
let db:Database
let profile:Profile|undefined
let msg_id:string
let invite:Email


beforeAll(async () => {
    // Confirm running against sandbox before creating anything
    admin = sandbox_credentials()
    await assert_sandbox(admin)
    const globals = await setup_globals()
    db = globals.db
    load_static_files(globals.native)
})


afterAll(async () => {
    // Delete everything the test user stored, then the user itself
    await delete_hosted_account(db, profile, admin, username)
})


describe('send and view', () => {

    // App's send task encrypts and uploads a copy and produces an invite for the recipient
    test('app sends message to hosted storage', async () => {
        profile = await create_hosted_profile(db, username)
        ;({msg_id, invite} = await send_test_message(db, profile))
        const copies = await db.copies.list_for_msg(msg_id)
        expect(copies.map(copy => [copy.uploaded_latest, copy.invited])).toEqual([[true, true]])
        expect(invite.to.address).toBe('recipient@example.com')
        expect(invite_urls(invite).view.startsWith(`${profile.view_displayer}#`)).toBe(true)
    })

    // Invite image is decrypted and served by the inviter API for email clients
    test('invite image is served', async () => {
        const resp = await fetch(invite_urls(invite).image)
        expect(resp.status).toBe(200)
        expect(resp.headers.get('content-type')).toBe('image/jpeg')
    })

    // Recipient opens the invite link and the displayer decrypts and shows the message
    test('recipient can view message and reply in a real browser', async () => {
        expect(await view_and_reply(invite_urls(invite).view)).toContain("Integration message")
    })

    // App downloads and decrypts the reply, linking it to the message and contact
    test('app receives the reply', async () => {
        const replies = await receive_replies(db, msg_id)
        expect(replies.map(reply => [reply.content, reply.contact_name]))
            .toEqual([[REPLY_TEXT, "Recipient"]])
    })
})

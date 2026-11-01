
// Integration test of the main user journey against the real sandbox hosted stack:
// app sends a message, recipient opens invite link in a real browser, replies, app receives reply

import {afterAll, beforeAll, describe, expect, test, vi} from 'vitest'
import {chromium} from '@playwright/test'
import {Window} from 'happy-dom'

import {setup_globals} from '@/../tests/unit_utils'
import {assert_sandbox, create_hosted_profile, delete_hosted_account, load_static_files,
    sandbox_credentials, unique_name} from '@/../tests/integration_utils'
import {send_message} from './sending'
import {responses_receive} from './responses'
import {Task} from './tasks'
import * as email from '../email/email'
import {external_encrypt} from '../misc/external_crypt'
import type {Browser} from '@playwright/test'
import type {Database} from '../database/database'
import type {Profile} from '../database/profiles'
import type {HostCredentialsAws} from '../hosts/aws_common'
import type {Email} from '../native/types'


const username = unique_name()
const msg_text = "Hello from the integration test"
const reply_text = "Reply typed into the real displayer"

let admin:HostCredentialsAws
let db:Database
let profile:Profile|undefined
let browser:Browser|undefined
let msg_id:string
let invite:Email


beforeAll(async () => {
    // Confirm running against sandbox before creating anything
    admin = sandbox_credentials()
    await assert_sandbox(admin)
    const globals = await setup_globals()
    db = globals.db
    load_static_files(globals.native)

    // Template rendering parses html, which node lacks
    globalThis.DOMParser = new Window().DOMParser as unknown as typeof DOMParser

    // Capture invite emails rather than sending them
    vi.spyOn(email, 'new_email_task').mockImplementation(() => ({
        send: async (sent:Email) => {
            invite = sent
            return true
        },
        abort: vi.fn(),
    }))
})


afterAll(async () => {
    // Close browser and delete everything the test user stored, then the user itself
    await browser?.close()
    await delete_hosted_account(db, profile, admin, username)
})


describe('send and view', () => {

    // App's send task encrypts and uploads a copy and produces an invite for the recipient
    test('app sends message to hosted storage', async () => {
        profile = await create_hosted_profile(db, username)
        profile.msg_options_identity.sender_name = "Integration Sender"
        profile.options.send_to_self = 'no'
        profile.smtp.pass = await external_encrypt('unused')
        await db.profiles.set(profile)

        // Create a message with a single text section to one contact
        const section = await db.sections.create('text')
        if (section.content.type !== 'text'){
            throw new Error("impossible")
        }
        section.content.html = `<p>${msg_text}</p>`
        await db.sections.set(section)
        const [contact] = await db.contacts.create([{name: "Recipient",
            address: 'recipient@example.com'}])
        const draft = await db.drafts.create()
        draft.profile = profile.id
        draft.title = "Integration message"
        draft.sections = [[section.id]]
        draft.recipients.include_contacts = [contact!.id]
        await db.drafts.set(draft)
        msg_id = (await db.draft_to_message(draft.id)).id

        await send_message(new Task('send_message', [msg_id], []))
        const copies = await db.copies.list_for_msg(msg_id)
        expect(copies.map(copy => [copy.uploaded_latest, copy.invited])).toEqual([[true, true]])
        expect(invite.to.address).toBe('recipient@example.com')
    })

    // Invite image is decrypted and served by the inviter API for email clients
    test('invite image is served', async () => {
        const image_url = /<img src='([^']+)'/.exec(invite.html)![1]!.replaceAll('&amp;', '&')
        const resp = await fetch(image_url)
        expect(resp.status).toBe(200)
        expect(resp.headers.get('content-type')).toBe('image/jpeg')
    })

    // Recipient opens the invite link and the displayer decrypts and shows the message
    test('recipient can view message and reply in a real browser', async () => {
        const url = /<a href='([^']+#[^']+)'/.exec(invite.html)![1]!
        expect(url.startsWith(`${profile!.view_displayer}#`)).toBe(true)

        browser = await chromium.launch()
        const page = await browser.newPage()
        await page.goto(url)
        await page.getByText(msg_text).waitFor({timeout: 30_000})
        expect(await page.title()).toContain("Integration message")

        // Reply via the message's reply form
        await page.getByPlaceholder("Secure reply...").fill(reply_text)
        await page.getByPlaceholder("Secure reply...").press('Control+Enter')
        await page.locator('.last', {hasText: reply_text}).waitFor({timeout: 30_000})
    })

    // App downloads and decrypts the reply, linking it to the message and contact
    test('app receives the reply', async () => {
        await responses_receive(new Task('responses_receive', [], []))
        const replies = await db.replies.list()
        expect(replies.map(reply => [reply.content, reply.msg_id, reply.contact_name]))
            .toEqual([[reply_text, msg_id, "Recipient"]])
    })
})


// Helpers for integration tests of the main user journey (send, view in real browser, reply)

import {vi} from 'vitest'
import {chromium} from '@playwright/test'
import {Window} from 'happy-dom'

import {send_message} from '@/services/tasks/sending'
import {responses_receive} from '@/services/tasks/responses'
import {Task} from '@/services/tasks/tasks'
import * as email from '@/services/email/email'
import {external_encrypt} from '@/services/misc/external_crypt'
import type {Database} from '@/services/database/database'
import type {Profile} from '@/services/database/profiles'
import type {RecordReply} from '@/services/database/types'
import type {Email} from '@/services/native/types'


export const MSG_TEXT = "Hello from the integration test"
export const REPLY_TEXT = "Reply typed into the real displayer"


export async function send_test_message(db:Database, profile:Profile)
        :Promise<{msg_id:string, invite:Email}>{
    // Send a single text section message to one contact, capturing the invite email
    // NOTE Requires static files to be loaded (for default invite image)

    // Template rendering parses html, which node lacks
    globalThis.DOMParser = new Window().DOMParser as unknown as typeof DOMParser

    // Capture invite emails rather than sending them
    const invites:Email[] = []
    const email_spy = vi.spyOn(email, 'new_email_task').mockImplementation(() => ({
        send: async (sent:Email) => {
            invites.push(sent)
            return true
        },
        abort: vi.fn(),
    }))

    // Prepare profile for sending
    profile.msg_options_identity.sender_name = "Integration Sender"
    profile.options.send_to_self = 'no'
    profile.smtp.pass = await external_encrypt('unused')
    await db.profiles.set(profile)

    // Create a message with a single text section to one contact
    const section = await db.sections.create('text')
    if (section.content.type !== 'text'){
        throw new Error("impossible")
    }
    section.content.html = `<p>${MSG_TEXT}</p>`
    await db.sections.set(section)
    const [contact] = await db.contacts.create([{name: "Recipient",
        address: 'recipient@example.com'}])
    const draft = await db.drafts.create()
    draft.profile = profile.id
    draft.title = "Integration message"
    draft.sections = [[section.id]]
    draft.recipients.include_contacts = [contact!.id]
    await db.drafts.set(draft)
    const msg_id = (await db.draft_to_message(draft.id)).id

    // Send using the app's own task
    try {
        await send_message(new Task('send_message', [msg_id], []))
    } finally {
        email_spy.mockRestore()
    }
    if (invites.length !== 1){
        throw new Error(`Expected one invite but got ${invites.length}`)
    }
    return {msg_id, invite: invites[0]!}
}


export function invite_urls(invite:Email):{view:string, image:string}{
    // Extract the view link and invite image url from an invite email's html
    return {
        view: /<a href='([^']+#[^']+)'/.exec(invite.html)![1]!.replaceAll('&amp;', '&'),
        image: /<img src='([^']+)'/.exec(invite.html)![1]!.replaceAll('&amp;', '&'),
    }
}


export async function view_and_reply(view_url:string):Promise<string>{
    // Open message in a real browser, confirm it's decrypted and shown, then reply via the page
    // Returns the page title once the message has been shown
    const browser = await chromium.launch()

    // Collect browser-side problems so failures can be diagnosed
    const problems:string[] = []
    try {
        const page = await browser.newPage()
        page.on('console', msg => {
            if (msg.type() === 'error' || msg.type() === 'warning'){
                problems.push(`console ${msg.type()}: ${msg.text()}`)
            }
        })
        page.on('pageerror', error => problems.push(`page error: ${error.message}`))
        page.on('requestfailed', request => problems.push(
            `request failed: ${request.url()} ${request.failure()?.errorText ?? ''}`))
        page.on('response', response => {
            if (response.status() >= 400){
                problems.push(`response ${response.status()}: ${response.url()}`)
            }
        })

        await page.goto(view_url)
        await page.getByText(MSG_TEXT).waitFor({timeout: 30_000})
        const title = await page.title()
        await page.getByPlaceholder("Secure reply...").fill(REPLY_TEXT)
        await page.getByPlaceholder("Secure reply...").press('Control+Enter')
        await page.locator('.last', {hasText: REPLY_TEXT}).waitFor({timeout: 30_000})
        return title
    } catch (error){
        throw new Error(`${String(error)}\n\nBrowser problems:\n${problems.join('\n')}`,
            {cause: error})
    } finally {
        await browser.close()
    }
}


export async function receive_replies(db:Database, msg_id:string):Promise<RecordReply[]>{
    // Download responses with the app's own task and return replies for the given message
    await responses_receive(new Task('responses_receive', [], []))
    return (await db.replies.list()).filter(reply => reply.msg_id === msg_id)
}

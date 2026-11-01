
// Tests for Database methods that interact with multiple stores

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {setup_globals, MemoryNative} from '@/../tests/unit_utils'
import {Database} from './database'
import {Draft} from './drafts'
import {Profile} from './profiles'
import * as gracious from '@/services/hosts/gracious_user'
import type {RecordReplaction} from './types'
import {sleep} from '../utils/async'


let db:Database
let native:MemoryNative

beforeEach(async () => {
    ({db, native} = await setup_globals())
})


// Helper to create a ready-to-send profile
async function new_profile(send_to_self:Profile['options']['send_to_self']='no'){
    const profile = await db.profiles.create()
    profile.email = 'sender@example.com'
    profile.options.send_to_self = send_to_self
    profile.msg_options_identity.sender_name = 'Sender'
    await db.profiles.set(profile)
    return profile
}


describe('draft_copy', () => {

    test('copies safe fields, sections and blobs into new draft', async () => {
        native.files.set('Internal Files/inv.png', new ArrayBuffer(3))
        const original = await db.drafts.create()
        original.title = 'Title'
        original.reply_to = 'r'
        original.options_identity.invite_image = 'inv.png'
        original.recipients.include_contacts = ['c1']
        const section = await db.sections.create('text')
        original.sections = [[section.id]]
        await db.drafts.set(original)

        const copy = await db.draft_copy(original.id, true)
        expect(copy.id).not.toBe(original.id)
        expect(copy.title).toBe('Title')
        expect(copy.template).toBe(true)
        expect(copy.reply_to).toBe('r')
        expect(copy.recipients).toEqual(original.recipients)
        expect(copy.recipients).not.toBe(original.recipients)
        expect(copy.sections[0]![0]).not.toBe(section.id)
        expect(await db.sections.get(copy.sections[0]![0])).toBeDefined()
        expect(copy.options_identity.invite_image).not.toBe('inv.png')
        await sleep(10)  // Impatient copy completes
        expect(native.files.has(`Internal Files/${copy.options_identity.invite_image as string}`))
            .toBe(true)
        expect(await db.drafts.get(copy.id)).toBeDefined()
    })

    test('accepts a Draft instance and inherits template value', async () => {
        const original = await db.drafts.create(true)
        const copy = await db.draft_copy(new Draft(original))
        expect(copy.template).toBe(true)
    })

    test('missing sections are skipped and reported', async () => {
        const original = await db.drafts.create()
        original.sections = [['missing']]
        await db.drafts.set(original)
        const copy = await db.draft_copy(original.id)
        expect(copy.sections).toEqual([])
        expect(self.app_report_error).toHaveBeenCalled()
    })
})


describe('draft_to_message', () => {

    test('creates message and copies for final recipients, deleting draft', async () => {
        const profile = await new_profile('no')
        const [a, b] = await db.contacts.create([{name: 'A B', address: 'a@x'}, {name: 'B'}])
        const draft = await db.drafts.create()
        draft.profile = profile.id
        draft.title = 'News'
        draft.recipients.include_contacts = [a!.id, b!.id]
        await db.drafts.set(draft)

        const msg = await db.draft_to_message(draft.id)
        expect(msg.lifespan).toBe(7)
        expect(msg.max_reads).toBe(3)
        expect(await db.drafts.get(draft.id)).toBeUndefined()
        expect(await db.messages.get(msg.id)).toBeDefined()
        const copies = await db.copies.list_for_msg(msg.id)
        expect(copies.map(c => c.contact_id).sort()).toEqual([a!.id, b!.id].sort())
        const copy_a = copies.find(c => c.contact_id === a!.id)!
        expect(copy_a.contact_hello).toBe('A')
        expect(copy_a.contact_address).toBe('a@x')
        expect(copy_a.uploaded).toBe(false)
        expect(copy_a.invited).toBe(null)
        // resp_token must be derivable from secret
        expect(await db.copies.get_by_resp_token(copy_a.resp_token)).toBeDefined()
    })

    test('draft security options override profile', async () => {
        const profile = await new_profile()
        const draft = await db.drafts.create()
        draft.profile = profile.id
        draft.options_security = {lifespan: Infinity, max_reads: 10}
        await db.drafts.set(draft)
        const msg = await db.draft_to_message(draft.id)
        expect(msg.lifespan).toBe(Infinity)
        expect(msg.max_reads).toBe(10)
    })

    test('self copy created with address depending on send_to_self option', async () => {
        for (const [option, reply_to, expected] of [
            ['yes', null, 'sender@example.com'],
            ['yes_without_replies_email', null, 'sender@example.com'],
            ['yes_without_replies_email', 'r', ''],
            ['yes_without_email', null, ''],
        ] as const){
            const profile = await new_profile(option)
            const draft = await db.drafts.create()
            draft.profile = profile.id
            draft.reply_to = reply_to
            await db.drafts.set(draft)
            const msg = await db.draft_to_message(draft.id)
            const copies = await db.copies.list_for_msg(msg.id)
            const self_copy = copies.find(c => c.contact_id === 'self')!
            expect(self_copy.contact_address).toBe(expected)
            expect(self_copy.contact_multiple).toBe(true)
            expect(self_copy.contact_name).toBe('Sender')
        }
    })

    test('marks replaction being replied to as replied', async () => {
        const profile = await new_profile()
        const reply:RecordReplaction = {
            id: 'reply1', sent: new Date(), ip: null, user_agent: '', copy_id: null, msg_id: null,
            msg_title: null, contact_id: null, contact_name: null, section_id: null,
            subsection_id: null, content: 'x', read: false, replied: false, archived: false,
        }
        await db.replies.set(reply)
        await db.reactions.set({...reply, id: 'reaction1'} as RecordReplaction & {copy_id:string})
        for (const id of ['reply1', 'reaction1']){
            const draft = await db.drafts.create()
            draft.profile = profile.id
            draft.reply_to = id
            await db.drafts.set(draft)
            await db.draft_to_message(draft.id)
        }
        await sleep(10)
        expect((await db.replies.get('reply1'))!.replied).toBe(true)
        expect((await db.reactions.get('reaction1'))!.replied).toBe(true)
    })

    test('excludes unsubscribed contacts for profile', async () => {
        const profile = await new_profile()
        const contact = await db.contacts.create({name: 'A'})
        const group = await db.groups.create('G', [contact.id])
        await db.unsubscribes.set({profile: profile.id, contact: contact.id, sent: new Date(),
            ip: null, user_agent: null})
        const draft = await db.drafts.create()
        draft.profile = profile.id
        draft.recipients.include_groups = [group.id]
        await db.drafts.set(draft)
        const msg = await db.draft_to_message(draft.id)
        expect(await db.copies.list_for_msg(msg.id)).toHaveLength(0)
    })
})


describe('draft_recipients_descriptor', () => {

    test('describes all, groups, contacts and excludes', async () => {
        const describe_recipients = db.draft_recipients_descriptor()
        const group = await db.groups.create('Family')
        const contacts = await db.contacts.create([{name: 'A'}, {name: 'B'}, {name: 'C'},
            {name: 'D'}])
        const draft = await db.drafts.create()

        draft.recipients.include_groups = ['all', group.id]
        expect(await describe_recipients(draft)).toBe('All contacts, ...')

        draft.recipients.include_groups = [group.id, 'deleted']
        expect(await describe_recipients(draft)).toBe('Family, ...')

        draft.recipients.include_groups = [group.id]
        expect(await describe_recipients(draft)).toBe('Family')

        draft.recipients.include_groups = []
        draft.recipients.include_contacts = contacts.map(c => c.id)
        expect(await describe_recipients(draft)).toBe('A, B, C, ...')

        draft.recipients.include_contacts = ['deleted1', 'deleted2']
        expect(await describe_recipients(draft)).toBe('2 contacts, ...')

        draft.recipients.include_contacts = []
        draft.recipients.include_groups = ['deleted']
        expect(await describe_recipients(draft)).toBe('1 groups, ...')

        draft.recipients.include_groups = []
        expect(await describe_recipients(draft)).toBe('')

        draft.recipients.include_contacts = [contacts[0]!.id]
        draft.recipients.exclude_contacts = [contacts[1]!.id]
        expect(await describe_recipients(draft)).toBe('A, ...')
    })
})


describe('responses', () => {

    // Helper to create a message with a single copy
    async function msg_with_copy(){
        const profile = await new_profile()
        const contact = await db.contacts.create({name: 'Contact', address: 'c@x'})
        const draft = await db.drafts.create()
        draft.profile = profile.id
        draft.title = 'Msg Title'
        draft.recipients.include_contacts = [contact.id]
        await db.drafts.set(draft)
        const msg = await db.draft_to_message(draft.id)
        const copy = (await db.copies.list_for_msg(msg.id))[0]!
        return {msg, copy, contact}
    }

    test('read_create requires valid resp_token', async () => {
        const {copy, msg} = await msg_with_copy()
        expect(await db.read_create(new Date(), 'invalid', null, 'ua')).toBe(null)
        const read = await db.read_create(new Date(), copy.resp_token, '1.2.3.4', 'ua')
        expect(read!.msg_id).toBe(msg.id)
        expect(await db.reads.list_for_msg(msg.id)).toHaveLength(1)
    })

    test('reply_create fills in copy details when resp_token valid', async () => {
        const {copy, contact} = await msg_with_copy()
        const reply = await db.reply_create('hi', new Date(), copy.resp_token, 's', null, null, '')
        expect(reply.msg_title).toBe('Msg Title')
        expect(reply.contact_id).toBe(contact.id)
        expect(reply.contact_name).toBe('Contact')
        const anon = await db.reply_create('hi', new Date(), 'bad', null, null, null, '')
        expect(anon.copy_id).toBe(null)
        expect(await db.replies.list()).toHaveLength(2)
    })

    test('reaction_create replaces and deletes by properties', async () => {
        const {copy} = await msg_with_copy()
        expect(await db.reaction_create('like', new Date(), 'bad', 's', null, null, '')).toBe(null)
        const first = await db.reaction_create('like', new Date(), copy.resp_token, 's', null,
            null, '')
        const second = await db.reaction_create('love', new Date(), copy.resp_token, 's', null,
            null, '')
        expect(first!.id).toBe(second!.id)
        expect((await db.reactions.list()).map(r => r.content)).toEqual(['love'])
        expect(await db.reaction_create(null, new Date(), copy.resp_token, 's', null, null, ''))
            .toBe(null)
        expect(await db.reactions.list()).toHaveLength(0)
    })
})


describe('new_host_user', () => {

    test('aws profile uses stored settings', async () => {
        const profile = await new_profile()
        profile.host = {cloud: 'aws', bucket: 'b', region: 'us-west-2',
            generated: {credentials: {accessKeyId: 'k', secretAccessKey: 's'}}}
        const user = await db.new_host_user(profile)
        expect(user.cloud).toBe('aws')
        expect(user.bucket).toBe('b')
    })

    test('gracious profile refreshes expired id token and gets credentials', async () => {
        const login = vi.spyOn(gracious, 'new_login').mockResolvedValue(
            {IdToken: 'new_token', id_token_expires: Date.now() + 1e8} as never)
        const creds = vi.spyOn(gracious, 'new_credentials').mockResolvedValue(
            {accessKeyId: 'k', secretAccessKey: 's', sessionToken: 't'})
        const profile = await new_profile()
        profile.host = {cloud: 'gracious', plan: 'c', username: 'user', password: 'p',
            federated_id: 'f', id_token: 'old', id_token_exires: 0}
        const user = await db.new_host_user(profile)
        expect(login).toHaveBeenCalledWith('user', 'p')
        expect(creds).toHaveBeenCalledWith('f', 'new_token')
        expect(user.cloud).toBe('gracious')
        expect(user.user).toBe('user')

        // Doesn't login again if token still valid
        login.mockClear()
        await db.new_host_user(profile)
        expect(login).not.toHaveBeenCalled()
        vi.restoreAllMocks()
    })
})


describe('contacts_merge', () => {

    test('delegates to merge_contacts', async () => {
        const [a, b] = await db.contacts.create([{name: 'A'}, {name: 'B'}])
        await db.contacts_merge(a!.id, [b!.id])
        expect((await db.contacts.list()).map(c => c.id)).toEqual([a!.id])
    })
})


describe('generate_example_data', () => {

    test('creates profile, contacts and drafts', async () => {
        vi.stubEnv('VITE_DEV_HOST_SETTINGS', JSON.stringify({cloud: 'aws', bucket: 'b',
            region: 'r', generated: {credentials: {}}}))
        vi.stubGlobal('createImageBitmap', async () => ({width: 1, height: 1}))
        vi.stubGlobal('OffscreenCanvas', class {
            width = 1
            height = 1
            getContext(){return {transferFromImageBitmap(){}, drawImage(){}}}
            async convertToBlob(){return new Blob(['x'], {type: 'image/webp'})}
        })
        await db.generate_example_data(1)
        expect((await db.profiles.list()).length).toBe(1)
        expect((await db.contacts.list()).length).toBeGreaterThanOrEqual(100)
        expect((await db.drafts.list()).length).toBeGreaterThan(0)
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
    }, 30_000)
})


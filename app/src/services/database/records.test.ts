
// Tests for record classes and simple per-store database methods

import {beforeEach, describe, expect, test} from 'vitest'

import {setup_globals} from '@/../tests/unit_utils'
import {Database} from './database'
import {Contact} from './contacts'
import {Group} from './groups'
import {Draft} from './drafts'
import {Message} from './messages'
import {MessageCopy} from './copies'
import {Section} from './sections'
import {OAuth} from './oauths'
import {Reaction} from './reactions'
import {Reply} from './replies'
import {rm_section_id} from './utils'
import type {RecordMessageCopy, RecordSectionContent} from './types'
import {sleep} from '../utils/async'


let db:Database

beforeEach(async () => {
    ({db} = await setup_globals())
})


describe('Contact', () => {

    // Helper for making contacts with only relevant props
    const contact = (props:Partial<Contact>) => new Contact({
        id: 'c', created: new Date(), name: '', name_hello: '', address: '', notes: '',
        service_account: null, service_id: null, multiple: false, ...props,
    })

    test('display falls back through name, hello, address, placeholder', () => {
        expect(contact({name: ' Bob '}).display).toBe('Bob')
        expect(contact({name_hello: 'Bobby'}).display).toBe('Bobby')
        expect(contact({address: 'bob@x.com'}).display).toBe('bob')
        expect(contact({}).display).toBe('[Nameless]')
    })

    test('name_hello_result', () => {
        expect(contact({name: 'Sarah & Simon Smith'}).name_hello_result).toBe('Sarah & Simon')
        expect(contact({name: 'Sarah'}).name_hello_result).toBe('Sarah')
        expect(contact({name: 'The Smiths', multiple: true}).name_hello_result).toBe('The Smiths')
        expect(contact({name: 'Sarah Smith', name_hello: 'Sez'}).name_hello_result).toBe('Sez')
    })
})


describe('DatabaseContacts', () => {

    test('create single and multiple, then list/get/remove', async () => {
        const one = await db.contacts.create({name: 'A', address: 'a@x'})
        const many = await db.contacts.create([{name: 'B'}, {address: 'c@x', notes: 'n',
            service_account: 'google:1', service_id: 's'}])
        expect(one.name).toBe('A')
        expect(many).toHaveLength(2)
        expect((await db.contacts.list())).toHaveLength(3)
        expect((await db.contacts.get(one.id))?.address).toBe('a@x')
        expect(await db.contacts.list_for_address('c@x')).toHaveLength(1)
        expect(await db.contacts.list_for_account('google', '1')).toHaveLength(1)
        await db.contacts.remove([one.id, many[0]!.id])
        await db.contacts.remove(many[1]!.id)
        expect(await db.contacts.list()).toHaveLength(0)
        expect(await db.contacts.get('missing')).toBeUndefined()
    })

    test('create with no args creates empty contact', async () => {
        const contact = await db.contacts.create()
        expect(contact.name).toBe('')
        expect(contact.service_account).toBe(null)
    })
})


describe('DatabaseGroups', () => {

    test('crud and display', async () => {
        const group = await db.groups.create('Friends', ['c1'], 'google:1', 'g1')
        expect(group.display).toBe('Friends')
        expect(new Group({...group, name: ' '}).display).toBe('[Nameless]')
        expect((await db.groups.get(group.id))?.contacts).toEqual(['c1'])
        expect(await db.groups.list_for_account('google', '1')).toHaveLength(1)
        group.name = 'Renamed'
        await db.groups.set(group)
        expect((await db.groups.list())[0]!.name).toBe('Renamed')
    })

    test('remove also removes group from drafts', async () => {
        const group = await db.groups.create('G')
        const other = await db.groups.create('Other')
        const draft = await db.drafts.create()
        draft.recipients.include_groups = [group.id, other.id]
        draft.recipients.exclude_groups = [group.id]
        await db.drafts.set(draft)
        const untouched = await db.drafts.create()
        await db.groups.remove(group.id)
        expect(await db.groups.get(group.id)).toBeUndefined()
        const updated = await db.drafts.get(draft.id)
        expect(updated!.recipients.include_groups).toEqual([other.id])
        expect(updated!.recipients.exclude_groups).toEqual([])
        expect((await db.drafts.get(untouched.id))!.modified).toEqual(untouched.modified)
    })
})


describe('DatabaseDrafts', () => {

    test('create uses default profile and display', async () => {
        self.app_store.state.default_profile = 'p1'
        const draft = await db.drafts.create(true)
        expect(draft.template).toBe(true)
        expect(draft.profile).toBe('p1')
        expect(draft.display).toBe('[Untitled]')
        draft.title = 'Hi'
        expect(new Draft(draft).display).toBe('Hi')
        expect(await db.drafts.list()).toHaveLength(1)
    })

    test('remove deletes draft, sections and invite image file', async () => {
        const native = self.app_native as import('@/../tests/unit_utils').MemoryNative
        native.files.set('Internal Files/img.png', new ArrayBuffer(1))
        const draft = await db.drafts.create()
        const section = await db.sections.create('text')
        draft.sections = [[section.id]]
        draft.options_identity.invite_image = 'img.png'
        await db.drafts.set(draft)
        await db.drafts.remove(draft.id)
        expect(await db.drafts.get(draft.id)).toBeUndefined()
        expect(await db.sections.get(section.id)).toBeUndefined()
        expect(native.files.has('Internal Files/img.png')).toBe(false)
        await expect(db.drafts.remove('missing')).resolves.toBeUndefined()
    })
})


describe('Message', () => {

    // Helper for making a message with given props
    const message = (props:Partial<Message>) => new Message({
        id: 'm', published: new Date(), expired: false,
        draft: {title: ' '} as Message['draft'], assets_key: {} as CryptoKey,
        assets_uploaded: {}, lifespan: 7, max_reads: 3, ...props,
    })

    test('display and safe values', () => {
        expect(message({}).display).toBe('[Untitled]')
        expect(message({max_reads: 0}).safe_max_reads).toBe(1)
        expect(message({max_reads: Infinity}).safe_max_reads).toBe(Infinity)
        expect(message({lifespan: Infinity}).safe_lifespan).toBe(Infinity)
        expect(message({lifespan: 0}).safe_lifespan).toBe(1)
        expect(message({lifespan: 9999}).safe_lifespan).toBe(730)
    })

    test('expiry calculations', () => {
        const ten_days_ago = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
        const old = message({published: ten_days_ago, lifespan: 7})
        expect(old.probably_expired).toBe(true)
        expect(old.safe_lifespan_remaining).toBe(1)
        expect(old.expires!.getTime()).toBeLessThan(Date.now())
        const fresh = message({lifespan: 7})
        expect(fresh.probably_expired).toBe(false)
        expect(fresh.safe_lifespan_remaining).toBe(7)
        expect(message({lifespan: Infinity}).expires).toBe(null)
        expect(message({lifespan: Infinity}).probably_expired).toBe(false)
        expect(message({expired: true}).probably_expired).toBe(true)
    })
})


describe('MessageCopy', () => {

    // Helper for making a copy with given props
    const copy = (props:Partial<RecordMessageCopy>) => new MessageCopy({
        id: 'c', msg_id: 'm', secret: {} as CryptoKey, secret_sse: {} as CryptoKey,
        resp_token: 't', uploaded: false, uploaded_latest: false, invited: null, expired: false,
        contact_id: 'x', contact_name: '', contact_hello: '', contact_address: '',
        contact_multiple: false, ...props,
    })

    test('display', () => {
        expect(copy({contact_name: 'N'}).display).toBe('N')
        expect(copy({contact_address: 'a@b'}).display).toBe('a@b')
        expect(copy({}).display).toBe('[Nameless]')
    })

    test('status', () => {
        expect(copy({expired: true, invited: true}).status).toBe('expired')
        expect(copy({invited: true}).status).toBe('invited')
        expect(copy({invited: false, contact_address: 'a@b'}).status).toBe('invalid_address')
        expect(copy({invited: false, uploaded: true}).status).toBe('manual')
        expect(copy({uploaded: true, contact_address: 'a@b'}).status).toBe('pending_send')
        expect(copy({}).status).toBe('pending_upload')
    })
})


describe('Section', () => {

    // Helper for making a section with given content
    const section = (content:Partial<RecordSectionContent>, respondable:boolean|null=null) =>
        new Section({id: 's', respondable, content: content as RecordSectionContent})

    test('respondable_final', () => {
        expect(section({type: 'text', html: ''}, true).respondable_final).toBe(true)
        expect(section({type: 'text', html: 'x'.repeat(300)}, false).respondable_final).toBe(false)
        expect(section({type: 'text', html: 'x'.repeat(300), standout: 'important'})
            .respondable_final).toBe(false)
        expect(section({type: 'text', html: 'short'}).respondable_final).toBe(false)
        expect(section({type: 'text', html: 'x'.repeat(300)}).respondable_final).toBe(true)
        expect(section({type: 'files', files: []}).respondable_final).toBe(false)
        expect(section({type: 'images', images: [{}], hero: true} as Partial<RecordSectionContent>)
            .respondable_final).toBe(false)
        expect(section({type: 'images', images: [{}, {}], hero: true} as
            Partial<RecordSectionContent>).respondable_final).toBe(true)
        expect(section({type: 'video'}).respondable_final).toBe(true)
    })

    test('is_plain_text and files_download', () => {
        expect(section({type: 'text', standout: null}).is_plain_text).toBe(true)
        expect(section({type: 'text', standout: 'notice'}).is_plain_text).toBe(false)
        expect(section({type: 'video'}).files_download).toBe(null)
        expect(section({type: 'files', files: [{ext: '.pdf'}]} as Partial<RecordSectionContent>)
            .files_download).toBe(false)
        expect(section({type: 'files', files: [{ext: '.doc'}]} as Partial<RecordSectionContent>)
            .files_download).toBe(true)
        expect(section({type: 'files', files: [{ext: '.pdf'}, {ext: '.pdf'}]} as
            Partial<RecordSectionContent>).files_download).toBe(true)
    })
})


describe('DatabaseSections', () => {

    test('create each type with sensible defaults', async () => {
        for (const type of ['text', 'images', 'video', 'chart', 'files', 'page'] as const){
            const section = await db.sections.create(type)
            expect(section.content.type).toBe(type)
            expect(section.respondable).toBe(null)
        }
        // @ts-expect-error Testing invalid input
        await expect(db.sections.create('invalid')).rejects.toThrow('invalid_type')
    })

    test('get, get_multiple and set', async () => {
        const a = await db.sections.create('text')
        const b = await db.sections.create('video')
        a.respondable = true
        await db.sections.set(a)
        expect((await db.sections.get(a.id))?.respondable).toBe(true)
        expect((await db.sections.get_multiple([a.id, b.id])).map(s => s.id)).toEqual([a.id, b.id])
        expect(await db.sections.get('missing')).toBeUndefined()
    })

    test('extract removes section and nested page sections and embeds blobs', async () => {
        const native = self.app_native as import('@/../tests/unit_utils').MemoryNative
        native.files.set('Internal Files/a.png', new Uint8Array([9]).buffer)
        native.files.set('Internal Files/b.pdf', new Uint8Array([8]).buffer)
        native.files.set('Internal Files/c.jpg', new Uint8Array([7]).buffer)
        const images = await db.sections.create('images')
        const files = await db.sections.create('files')
        const page = await db.sections.create('page')
        if (images.content.type !== 'images' || files.content.type !== 'files'
                || page.content.type !== 'page'){
            throw new Error('impossible')
        }
        images.content.images = [{id: 'i', data: 'a.png', caption: ''}]
        files.content.files = [{data: 'b.pdf', name: 'b', ext: '.pdf'}]
        page.content.image = 'c.jpg'
        page.content.sections = [[images.id, files.id]]
        await db.sections.set(images)
        await db.sections.set(files)
        await db.sections.set(page)

        const removed = await db.sections.extract(page.id)
        expect(removed[0]!.id).toBe(page.id)
        expect(removed.map(s => s.id).sort()).toEqual([images.id, files.id, page.id].sort())
        for (const s of removed){
            expect(await db.sections.get(s.id)).toBeUndefined()
        }
        const extracted_page = removed[0]!.content
        expect(extracted_page.type === 'page' && extracted_page.image).toBeInstanceOf(Blob)
        await sleep(0)  // Let fire-and-forget removes finish
        expect(native.files.size).toBe(0)
    })
})


describe('rm_section_id', () => {

    test('removes id and row if empty', () => {
        const sections:[string]|[string, string] extends infer R ? R[] : never = [['a', 'b'], ['c']]
        rm_section_id(sections, 'a')
        expect(sections).toEqual([['b'], ['c']])
        rm_section_id(sections, 'c')
        expect(sections).toEqual([['b']])
        expect(() => rm_section_id(sections, 'x')).toThrow('section_id_not_found')
    })
})


describe('DatabaseOAuths', () => {

    test('crud and lookups', async () => {
        const oauth = await db.oauths.create({
            issuer: 'google', issuer_id: '123', issuer_config: {}, email: 'a@gmail.com',
            name: 'A', scope_sets: ['contacts'], token_refresh: new ArrayBuffer(0),
            token_access: new ArrayBuffer(0), token_access_expires: null,
            contacts_sync: false, contacts_sync_last: null as unknown as Date,
            contacts_sync_token: null as unknown as string,
        })
        expect(oauth.display).toBe('a@gmail.com')
        expect(oauth.display_issuer).toBe('Google')
        expect(oauth.service_account).toBe('google:123')
        expect(new OAuth({...oauth, email: ''}).display).toBe('123')
        expect((await db.oauths.get_by_service_account('google:123'))?.id).toBe(oauth.id)
        expect(await db.oauths.list_by_issuer_id('google', '123')).toHaveLength(1)
        expect(await db.oauths.list()).toHaveLength(1)
        await db.oauths.remove(oauth.id)
        expect(await db.oauths.get(oauth.id)).toBeUndefined()
    })
})


describe('replactions, reads, unsubscribes and forms', () => {

    // Common props for replactions
    const common = {
        sent: new Date(), ip: null, user_agent: 'ua', copy_id: 'c', msg_id: 'm', msg_title: 't',
        contact_id: 'x', contact_name: 'n', section_id: null, subsection_id: null, content: 'hi',
        read: false, replied: false, archived: false,
    }

    test('Reaction and Reply type flags and id_from_properties', async () => {
        const reaction = new Reaction({...common, id: 'r'})
        expect(reaction.is_reaction).toBe(true)
        expect(reaction.is_reply).toBe(false)
        expect(reaction.id_from_properties).toBe('c-null-null')
        const reply = new Reply({...common, id: 'r'})
        expect(reply.is_reply).toBe(true)
        expect(reply.is_reaction).toBe(false)
        await db.reactions.set(reaction)
        await db.replies.set(reply)
        expect(await db.reactions.list()).toHaveLength(1)
        expect((await db.replies.get('r'))?.content).toBe('hi')
        await db.reactions.remove('r')
        await db.replies.remove('r')
        expect(await db.reactions.get('r')).toBeUndefined()
        expect(await db.replies.list()).toHaveLength(0)
    })

    test('reads', async () => {
        await db.reads.set({id: 'r', sent: new Date(), ip: null, user_agent: 'ua', copy_id: 'c',
            msg_id: 'm'})
        expect(await db.reads.list()).toHaveLength(1)
        expect(await db.reads.list_for_msg('m')).toHaveLength(1)
    })

    test('unsubscribes', async () => {
        await db.unsubscribes.set({profile: 'p', contact: 'c', sent: new Date(), ip: null,
            user_agent: null})
        expect(await db.unsubscribes.list()).toHaveLength(1)
        expect(await db.unsubscribes.list_for_profile('p')).toHaveLength(1)
        expect(await db.unsubscribes.list_for_contact('c')).toHaveLength(1)
        await db.unsubscribes.remove('p', 'c')
        expect(await db.unsubscribes.list()).toHaveLength(0)
    })

    test('subscribe forms', async () => {
        const form = await db.subscribe_forms.create('p')
        expect(form.id).toMatch(/^[A-Za-z0-9_~-]+$/)
        expect(form.text).toContain('Subscribe')
        expect(await db.subscribe_forms.list_for_profile('p')).toHaveLength(1)
        form.groups = ['g']
        await db.subscribe_forms.set(form)
        expect((await db.subscribe_forms.get(form.id))?.groups).toEqual(['g'])
        await db.subscribe_forms.remove(form.id)
        expect(await db.subscribe_forms.get(form.id)).toBeUndefined()
    })

    test('state', async () => {
        await db.state.set({key: 'a', value: 1})
        expect(await db.state.list()).toContainEqual({key: 'a', value: 1})
    })
})

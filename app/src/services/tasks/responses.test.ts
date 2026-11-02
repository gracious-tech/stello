
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {setup_globals} from '@/../tests/unit_utils'
import {Database} from '../database/database'
import {Profile} from '../database/profiles'
import {MessageCopy} from '../database/copies'
import {Task} from './tasks'
import {responses_receive} from './responses'
import {encrypt_asym, encrypt_sym, export_key, import_key_asym} from '../utils/crypt'
import {buffer_to_url64, string_to_utf8} from '../utils/coding'
import type {HostUser} from '../hosts/types'
import {sleep} from '../utils/async'


let db:Database
let profile:Profile
let copy:MessageCopy

// Fake storage contents (key -> encrypted data)
let objects:Map<string, ArrayBuffer>
let deleted:string[]
let downloaded:string[]
let download_delays:Record<string, number>

beforeEach(async () => {
    ({db} = await setup_globals())

    // Profile that is fully setup
    profile = await db.profiles.create()
    profile.setup_step = null
    profile.email = 'me@x'
    profile.options.send_to_self = 'no'
    await db.profiles.set(profile)

    // A sent message with one copy
    const contact = await db.contacts.create({name: 'Bob', address: 'bob@x'})
    const draft = await db.drafts.create()
    draft.profile = profile.id
    draft.title = 'Title'
    draft.recipients.include_contacts = [contact.id]
    await db.drafts.set(draft)
    const msg = await db.draft_to_message(draft.id)
    copy = (await db.copies.list_for_msg(msg.id))[0]!

    // Fake host storage
    objects = new Map()
    deleted = []
    downloaded = []
    download_delays = {}
    vi.spyOn(db, 'new_host_user').mockImplementation(async () => ({
        list_responses: async () => [...objects.keys()],
        download_response: async (key:string) => {
            downloaded.push(key)
            await sleep(download_delays[key] ?? 0)
            return objects.get(key)!
        },
        delete_response: async (key:string) => {
            deleted.push(key)
            objects.delete(key)
        },
    } as unknown as HostUser))
})

afterEach(() => {
    vi.restoreAllMocks()
})


// Counter for unique object keys in chronological order
let key_counter = 1000

async function add_response(type:string, event:Record<string, unknown>,
        encrypted:unknown={}, ip:string|null='1.1.1.1'){
    // Encrypt a response the same way the displayer + responder would
    const pub = await import_key_asym(await export_key(profile.host_state.resp_key.publicKey))
    const data = {
        ip,
        event: {
            ...event,
            encrypted: await encrypt_asym(string_to_utf8(JSON.stringify(encrypted)), pub),
        },
    }
    const key = `${type}/${key_counter++}_abc`
    objects.set(key, string_to_utf8(await encrypt_asym(string_to_utf8(JSON.stringify(data)), pub)))
    return key
}

async function encrypted_address(address:string){
    // Address encrypted with profile's secret (as included in invite links)
    return buffer_to_url64(await encrypt_sym(string_to_utf8(JSON.stringify({address})),
        profile.host_state.secret))
}

const run = () => responses_receive(new Task('responses_receive', [], []))


describe('responses_receive', () => {

    test('processes reads, replies and reactions and deletes them', async () => {
        await add_response('read', {resp_token: copy.resp_token, user_agent: 'ua'})
        await add_response('reply', {resp_token: copy.resp_token, user_agent: 'ua',
            section_id: 's1', subsection_id: 'sub1'}, {content: 'Hello!'})
        await add_response('reaction', {resp_token: copy.resp_token, user_agent: 'ua',
            section_id: 's2', subsection_id: 'sub2'}, {content: 'like'})
        await run()
        expect(objects.size).toBe(0)
        const reads = await db.reads.list_for_msg(copy.msg_id)
        expect(reads).toHaveLength(1)
        expect(reads[0]!.user_agent).toBe('ua')
        const replies = await db.replies.list()
        expect(replies[0]!.content).toBe('Hello!')
        expect(replies[0]!.section_id).toBe('s1')
        expect(replies[0]!.subsection_id).toBe('sub1')
        expect(replies[0]!.ip).toBe('1.1.1.1')
        expect(replies[0]!.user_agent).toBe('ua')
        expect(replies[0]!.sent).toEqual(new Date(1001 * 1000))
        const reactions = await db.reactions.list()
        expect(reactions[0]).toMatchObject({content: 'like', section_id: 's2',
            subsection_id: 'sub2', user_agent: 'ua'})
    })

    // Most important async responses are processed first, and all responses counted for progress
    test('async responses are prioritised and all responses counted', async () => {
        await add_response('read', {resp_token: copy.resp_token})
        await add_response('reply', {resp_token: copy.resp_token}, {content: 'Hi'})
        await add_response('subscribe', {form: 'x'}, {address: 'sub@x', name: '', content: ''})
        await add_response('resend', {resp_token: copy.resp_token, content: 'Lost'})
        const task = new Task('responses_receive', [], [])
        await responses_receive(task)
        expect(downloaded.map(k => k.split('/')[0])).toEqual(['subscribe', 'reply', 'read',
            'resend'])
        expect(task.subtasks_total).toBe(4)
    })

    test('unsubscribe and resubscribe via encrypted address', async () => {
        const address = await encrypted_address('bob@x')
        await add_response('subscription', {resp_token: 'unknown', user_agent: 'ua',
            subscribed: false, sym_encrypted: address})
        await run()
        expect(await db.unsubscribes.list_for_profile(profile.id)).toHaveLength(1)
        await add_response('subscription', {resp_token: copy.resp_token, user_agent: 'ua',
            subscribed: true})
        await run()
        expect(await db.unsubscribes.list_for_profile(profile.id)).toHaveLength(0)
    })

    // Address-only subscription changes match trimmed address, and copy-only don't match blanks
    test('subscription changes via encrypted address or copy alone', async () => {
        await db.contacts.create({name: 'Empty', address: ''})
        const unsubscribed = async () =>
            (await db.unsubscribes.list_for_profile(profile.id)).map(u => u.contact)

        // Unsubscribe via address alone (copy deleted)
        await add_response('subscription', {resp_token: 'unknown', subscribed: false,
            sym_encrypted: await encrypted_address(' bob@x ')})
        await run()
        expect(await unsubscribed()).toEqual([copy.contact_id])

        // Resubscribe then unsubscribe via copy alone (no address)
        await add_response('subscription', {resp_token: copy.resp_token, subscribed: true})
        await run()
        expect(await unsubscribed()).toEqual([])
        await add_response('subscription', {resp_token: copy.resp_token, subscribed: false})
        await run()
        expect(await unsubscribed()).toEqual([copy.contact_id])
    })

    // Address changes can be requested via encrypted address or copy alone
    test('address change requests via encrypted address or copy alone', async () => {
        await db.contacts.create({name: 'Empty', address: ''})

        // Via address alone (copy deleted), matching trimmed address
        await add_response('address', {resp_token: 'unknown', new_address: 'new@x',
            sym_encrypted: await encrypted_address(' bob@x ')})
        await run()
        expect(await db._conn.getAll('request_address')).toMatchObject([
            {contact: copy.contact_id, old_address: 'bob@x', new_address: 'new@x'}])

        // Via copy alone (no address)
        await db._conn.clear('request_address')
        await add_response('address', {resp_token: copy.resp_token, new_address: 'other@x'})
        await run()
        expect(await db._conn.getAll('request_address')).toMatchObject([
            {contact: copy.contact_id, old_address: 'bob@x', new_address: 'other@x'}])
    })

    test('multi-person contacts cannot change subscription or address', async () => {
        const contact = (await db.contacts.get(copy.contact_id))!
        contact.multiple = true
        await db.contacts.set(contact)
        await add_response('subscription', {resp_token: copy.resp_token, subscribed: false,
            sym_encrypted: await encrypted_address('bob@x')})
        await add_response('address', {resp_token: copy.resp_token, new_address: 'new@x',
            sym_encrypted: await encrypted_address('bob@x')})
        await run()
        expect(await db.unsubscribes.list()).toHaveLength(0)
        expect(await db._conn.getAll('request_address')).toHaveLength(0)
    })

    test('sync responses are applied in chronological order', async () => {
        // Sync responses must be applied in order (unsubscribe then resubscribe)
        const first = await add_response('subscription', {resp_token: copy.resp_token,
            subscribed: false})
        await add_response('subscription', {resp_token: copy.resp_token, subscribed: true})
        download_delays[first] = 30
        await run()
        expect(await db.unsubscribes.list_for_profile(profile.id)).toHaveLength(0)
    })

    test('address change requests', async () => {
        await add_response('address', {resp_token: copy.resp_token, new_address: 'new@x',
            sym_encrypted: await encrypted_address('bob@x')})
        await add_response('address', {resp_token: copy.resp_token, new_address: 'invalid'})
        await add_response('address', {resp_token: copy.resp_token, new_address: 'bob@x'})
        await run()
        const requests = await db._conn.getAll('request_address')
        expect(requests).toHaveLength(1)
        expect(requests[0]).toMatchObject({old_address: 'bob@x', new_address: 'new@x',
            contact: copy.contact_id})
        expect(objects.size).toBe(0)
    })

    test('resend requests with and without valid copy', async () => {
        await add_response('resend', {resp_token: copy.resp_token, content: 'Lost it'})
        await add_response('resend', {resp_token: 'unknown', content: 'Again'})
        await run()
        const requests = await db._conn.getAll('request_resend')
        expect(requests.map(r => r.reason).sort()).toEqual(['Again', 'Lost it'])
        expect(requests.find(r => r.reason === 'Lost it')!.contact).toBe(copy.contact_id)
    })

    test('subscribe requests from forms', async () => {
        const form = await db.subscribe_forms.create(profile.id)
        form.groups = ['g1']
        form.service_account = 'google:1'
        await db.subscribe_forms.set(form)
        await add_response('subscribe', {form: form.id}, {address: 'sub@x', name: 'Sub',
            content: 'Hi'}, null)
        await add_response('subscribe', {form: 'deleted'}, {address: 'del@x', name: '',
            content: ''})
        await add_response('subscribe', {form: form.id}, {address: 'invalid', name: '',
            content: ''})
        await run()
        const requests = await db._conn.getAll('request_subscribe')
        expect(requests).toHaveLength(2)
        const sub = requests.find(r => r.address === 'sub@x')!
        expect(sub).toMatchObject({name: 'Sub', message: 'Hi', groups: ['g1'], ip: null,
            profile: profile.id, service_account: 'google:1'})
        expect(requests.find(r => r.address === 'del@x')).toMatchObject({groups: [],
            service_account: null})
    })

    test('undecryptable responses are deleted and error thrown after processing rest',
        async () => {
            objects.set('reply/1_bad', string_to_utf8('{"encrypted_data":"x","encrypted_key":"y"}'))
            await add_response('read', {resp_token: copy.resp_token})
            await expect(run()).rejects.toThrow('Could not decrypt response')
            expect(deleted).toContain('reply/1_bad')
            expect(await db.reads.list()).toHaveLength(1)
        })

    test('undecryptable encrypted field is deleted', async () => {
        const pub = await import_key_asym(await export_key(profile.host_state.resp_key.publicKey))
        objects.set('reply/2_x', string_to_utf8(await encrypt_asym(string_to_utf8(JSON.stringify(
            {ip: null, event: {encrypted: '{"encrypted_data":"x","encrypted_key":"y"}'}})), pub)))
        await expect(run()).rejects.toThrow("encrypted field")
        expect(deleted).toContain('reply/2_x')
    })

    // Encrypted field must be an object, otherwise its contents could be misinterpreted
    test('encrypted field that is not an object is rejected', async () => {
        await add_response('read', {resp_token: copy.resp_token}, 'not an object')
        await expect(run()).rejects.toThrow('not an object')
        expect(await db.reads.list()).toHaveLength(0)
        expect(objects.size).toBe(1)  // Not deleted so can investigate
    })

    test('encrypted props cannot overwrite plain props', async () => {
        await add_response('reply', {resp_token: copy.resp_token, content: 'plain'},
            {content: 'encrypted'})
        await expect(run()).rejects.toThrow('overwrites existing')
        expect(objects.size).toBe(1)  // Not deleted so can investigate
    })

    test('unknown response types are reported and kept', async () => {
        await add_response('future_type', {})
        await run()
        expect(self.app_report_error).toHaveBeenCalled()
        expect(objects.size).toBe(1)
    })

    test('falls back to old keys when current fail', async () => {
        // Rotate keys, keeping old ones
        const old_resp_key = profile.host_state.resp_key
        const old_secret = profile.host_state.secret
        const address = await encrypted_address('bob@x')
        await add_response('subscription', {resp_token: 'x', subscribed: false,
            sym_encrypted: address})
        const fresh = await db.profiles.create_object()
        profile.host_state.resp_key = fresh.host_state.resp_key
        profile.host_state.resp_key_old = old_resp_key
        profile.host_state.secret = fresh.host_state.secret
        profile.host_state.secret_old = old_secret
        await db.profiles.set(profile)
        await run()
        expect(await db.unsubscribes.list()).toHaveLength(1)
    })

    test('profiles not setup are skipped and list errors are deferred', async () => {
        profile.setup_step = 1
        await db.profiles.set(profile)
        await add_response('read', {resp_token: copy.resp_token})
        await run()
        expect(objects.size).toBe(1)

        profile.setup_step = null
        await db.profiles.set(profile)
        vi.mocked(db.new_host_user).mockResolvedValueOnce({
            list_responses: async () => {throw new Error('list failed')},
        } as unknown as HostUser)
        await expect(run()).rejects.toThrow('list failed')
    })
})

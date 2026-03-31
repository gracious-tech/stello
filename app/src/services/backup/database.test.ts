
import 'fake-indexeddb/auto'  // WARN Must import before indexeddb accessed
import {expect, test} from '@playwright/test'

import {NativeBrowser} from '../native/native_browser'
import {migrate, migrate_async, DATABASE_VERSION} from '../database/migrations'
import {open_db} from '../database/migrations.test_utils'
import {DatabaseContacts} from '../database/contacts'
import {DatabaseGroups} from '../database/groups'
import {DatabaseSubscribeForms} from '../database/subscribe_forms'
import {DatabaseSections} from '../database/sections'
import {DatabaseDrafts} from '../database/drafts'
import {generate_token, generate_key_sym, generate_key_asym} from '../utils/crypt'
import {export_database, import_database} from './database'


// GLOBAL MOCKS


global.self = global as Window & typeof globalThis
self.app_native = new NativeBrowser()
self.app_native.app_file_read = async () => new ArrayBuffer(0)
self.app_store = {state: {default_profile: null}} as typeof self.app_store


// UTILS


async function open_test_db(name:string){
    return open_db(name, DATABASE_VERSION, migrate, migrate_async)
}


// TESTS


test('export and import produces identical data', async () => {

    // Populate source database
    const db1 = await open_test_db('backup_source')
    self.app_db = {_conn: db1} as typeof self.app_db

    const contacts = new DatabaseContacts(db1)
    const groups = new DatabaseGroups(db1)
    const subscribe_forms = new DatabaseSubscribeForms(db1)
    const sections = new DatabaseSections(db1)
    const drafts = new DatabaseDrafts(db1)

    // Profile (generates CryptoKeys; DatabaseProfiles not importable due to transitive ESM deps)
    const profile_id = generate_token()
    await db1.put('profiles', {
        id: profile_id,
        setup_step: null,
        email: 'sender@example.com',
        host: null,
        host_state: {
            version: null,
            secret: await generate_key_sym(true, ['encrypt', 'decrypt']),
            secret_old: null,
            shared_secret: await generate_key_sym(true, ['encrypt', 'decrypt']),
            resp_key: await generate_key_asym(true),
            resp_key_old: null,
            displayer_config_uploaded: false,
            subscribe_config_uploaded: false,
            responder_config_uploaded: false,
        },
        smtp: {oauth: null, user: '', pass: null, host: '', port: null, starttls: false},
        options: {
            send_to_self: 'yes_without_replies_email',
            notify_mode: 'replies',
            notify_include_contents: false,
            allow_replies: true,
            allow_comments: true,
            allow_reactions: true,
            allow_delete: true,
            allow_resend_requests: true,
            auto_exclude_threshold: null,
            auto_exclude_exempt_groups: [],
            smtp_no_reply: true,
            social_referral_ban: true,
            generic_domain: true,
            reaction_options: ['like', 'love', 'yay', 'pray', 'laugh', 'wow', 'sad'],
            reply_invite_image: null,
            reply_invite_tmpl_email: '',
            reply_invite_button: '',
            theme_style: 'modern',
            theme_color: {h: 200, s: 0.5, l: 0.5},
        },
        msg_options_identity: {
            sender_name: '',
            invite_image: null,
            invite_tmpl_email: '',
            invite_tmpl_clipboard: '',
            invite_button: '',
        },
        msg_options_security: {lifespan: Infinity, max_reads: Infinity},
    })

    // Contact (has created:Date field)
    const contact = await contacts.create({name: 'Test User', address: 'user@example.com'})

    // Group
    const group = await groups.create('Test Group', [contact.id])

    // OAuth (has ArrayBuffer tokens and nullable Dates)
    const dummy_buf = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer
    await db1.put('oauths', {
        id: generate_token(),
        issuer: 'google',
        issuer_id: 'google-user-123',
        issuer_config: {},
        email: 'user@gmail.com',
        name: 'Test User',
        scope_sets: ['email_send'],
        token_refresh: dummy_buf,
        token_access: dummy_buf,
        token_access_expires: new Date('2024-12-31T00:00:00.000Z'),
        contacts_sync: false,
        contacts_sync_last: null,
        contacts_sync_token: null,
    })

    // Subscribe form
    await subscribe_forms.create(profile_id)

    // Section
    const section = await sections.create_object({
        type: 'text',
        html: '<p>Hello world</p>',
        standout: null,
    })
    await sections.set(section)

    // Draft (standalone — kept in drafts table after message creation below)
    const draft = await drafts.create_object()
    draft.profile = profile_id
    draft.title = 'Test Draft'
    draft.sections = [[section.id] as [string]]
    draft.recipients.include_contacts = [contact.id]
    await drafts.set(draft)

    // Message + Copy (directly constructed)
    const msg_id = generate_token()
    const copy_id = generate_token()
    const resp_token = generate_token()
    await db1.put('messages', {
        id: msg_id,
        published: new Date('2024-06-01T00:00:00.000Z'),
        expired: false,
        draft: draft as typeof draft & {profile: string, template: false},
        assets_key: await generate_key_sym(true),
        assets_uploaded: {},
        lifespan: Infinity,
        max_reads: Infinity,
    })
    await db1.put('copies', {
        id: copy_id,
        msg_id,
        secret: await generate_key_sym(true, ['encrypt', 'decrypt']),
        secret_sse: await generate_key_sym(true, ['encrypt', 'decrypt']),
        resp_token,
        uploaded: false,
        uploaded_latest: false,
        invited: null,
        expired: false,
        contact_id: contact.id,
        contact_name: contact.name,
        contact_hello: contact.name_hello,
        contact_address: contact.address,
        contact_multiple: contact.multiple,
    })

    // Responses (read, reply, reaction)
    await db1.put('reads', {
        id: generate_token(),
        sent: new Date('2024-06-01T00:00:00.000Z'),
        ip: '1.2.3.4',
        user_agent: 'Mozilla/5.0',
        copy_id,
        msg_id,
    })
    await db1.put('replies', {
        id: generate_token(),
        sent: new Date('2024-06-02T00:00:00.000Z'),
        ip: '1.2.3.4',
        user_agent: 'Mozilla/5.0',
        copy_id,
        msg_id,
        msg_title: draft.title,
        contact_id: contact.id,
        contact_name: contact.name,
        section_id: null,
        subsection_id: null,
        content: 'Loved it!',
        read: false,
        replied: false,
        archived: false,
    })
    await db1.put('reactions', {
        id: generate_token(),
        sent: new Date('2024-06-03T00:00:00.000Z'),
        ip: '1.2.3.4',
        user_agent: 'Mozilla/5.0',
        copy_id,
        msg_id,
        msg_title: draft.title,
        contact_id: contact.id,
        contact_name: contact.name,
        section_id: section.id,
        subsection_id: null,
        content: 'like',
        read: false,
        replied: false,
        archived: false,
    })

    // Unsubscribe (composite key: [profile, contact])
    await db1.put('unsubscribes', {
        profile: profile_id,
        contact: contact.id,
        sent: new Date('2024-03-01T00:00:00.000Z'),
        ip: null,
        user_agent: null,
    })

    // Request address
    await db1.put('request_address', {
        contact: contact.id,
        old_address: 'old@example.com',
        new_address: 'new@example.com',
        sent: new Date('2024-04-01T00:00:00.000Z'),
        ip: null,
        user_agent: null,
    })

    // Request resend (composite key: [contact, message])
    await db1.put('request_resend', {
        contact: contact.id,
        message: msg_id,
        reason: 'Please resend this',
        sent: new Date('2024-05-01T00:00:00.000Z'),
        ip: null,
        user_agent: null,
    })

    // Request subscribe
    await db1.put('request_subscribe', {
        id: generate_token(),
        name: 'New Person',
        address: 'new@example.com',
        message: 'Please subscribe me',
        profile: profile_id,
        groups: [group.id],
        service_account: null,
        sent: new Date('2024-07-01T00:00:00.000Z'),
        ip: null,
        user_agent: null,
    })

    // Export source database
    const json = await export_database()

    // Import into fresh destination database
    const db2 = await open_test_db('backup_dest')
    self.app_db = {_conn: db2} as typeof self.app_db
    const {added, skipped} = await import_database(json)

    // All records should be new (db2 was empty)
    expect(skipped).toBe(0)
    expect(added).toBeGreaterThan(0)

    // Re-export from destination and compare — should be byte-for-byte identical
    // This verifies all field types (Dates, ArrayBuffers, CryptoKeys) round-trip correctly
    const json2 = await export_database()
    expect(json2).toEqual(json)
})

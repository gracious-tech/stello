
import 'fake-indexeddb/auto'  // WARN Must import before indexeddb accessed
import {expect, test} from '@playwright/test'

import {NativeBrowser} from '../native/native_browser'
import {migrate, migrate_async, DATABASE_VERSION} from '../database/migrations'
import {open_db} from '../database/migrations.test_utils'
import {generate_token, generate_key_sym, generate_key_asym} from '../utils/crypt'
import {export_database, import_database} from './database'


// GLOBAL MOCKS


global.self = global as Window & typeof globalThis
self.app_native = new NativeBrowser()
self.app_native.app_file_read = async () => new ArrayBuffer(0)


// UTILS


async function open_test_db(name:string){
    return open_db(name, DATABASE_VERSION, migrate, migrate_async)
}


// TESTS


test('export and import produces identical data', async () => {

    // Populate source database
    const db1 = await open_test_db('backup_source')
    self.app_db = {_conn: db1} as typeof self.app_db

    // Profile
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
    const contact_id = generate_token()
    await db1.put('contacts', {
        id: contact_id,
        created: new Date(),
        name: 'Test User',
        name_hello: '',
        address: 'user@example.com',
        notes: '',
        service_account: null,
        service_id: null,
        multiple: false,
    })

    // Group
    const group_id = generate_token()
    await db1.put('groups', {
        id: group_id,
        name: 'Test Group',
        contacts: [contact_id],
        service_account: null,
        service_id: null,
    })

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
    await db1.put('subscribe_forms', {
        id: generate_token(),
        profile: profile_id,
        text: '<h2>Subscribe to newsletter</h2>\n<p>To get our latest news.</p>',
        accept_message: false,
        groups: [],
        service_account: null,
    })

    // Section
    const section_id = generate_token()
    await db1.put('sections', {
        id: section_id,
        respondable: null,
        content: {type: 'text', html: '<p>Hello world</p>', standout: null},
    })

    // Draft (standalone — kept in drafts table after message creation below)
    const draft_id = generate_token()
    const draft_record = {
        id: draft_id,
        template: false as const,
        reply_to: null,
        modified: new Date(),
        title: 'Test Draft',
        sections: [[section_id]] as [string][],
        profile: profile_id,
        options_identity: {
            sender_name: '',
            invite_image: null,
            invite_tmpl_email: null,
            invite_tmpl_clipboard: null,
            invite_button: '',
        },
        options_security: {lifespan: null, max_reads: null},
        recipients: {
            include_groups: [],
            include_contacts: [contact_id],
            exclude_groups: [],
            exclude_contacts: [],
        },
    }
    await db1.put('drafts', draft_record)

    // Message + Copy (directly constructed)
    const msg_id = generate_token()
    const resp_token = generate_token()
    await db1.put('messages', {
        id: msg_id,
        published: new Date('2024-06-01T00:00:00.000Z'),
        expired: false,
        draft: draft_record,
        assets_key: await generate_key_sym(true),
        assets_uploaded: {},
        lifespan: Infinity,
        max_reads: Infinity,
    })
    const copy_id = generate_token()
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
        contact_id,
        contact_name: 'Test User',
        contact_hello: 'Test User',
        contact_address: 'user@example.com',
        contact_multiple: false,
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
        msg_title: 'Test Draft',
        contact_id,
        contact_name: 'Test User',
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
        msg_title: 'Test Draft',
        contact_id,
        contact_name: 'Test User',
        section_id,
        subsection_id: null,
        content: 'like',
        read: false,
        replied: false,
        archived: false,
    })

    // Unsubscribe (composite key: [profile, contact])
    await db1.put('unsubscribes', {
        profile: profile_id,
        contact: contact_id,
        sent: new Date('2024-03-01T00:00:00.000Z'),
        ip: null,
        user_agent: null,
    })

    // Request address
    await db1.put('request_address', {
        contact: contact_id,
        old_address: 'old@example.com',
        new_address: 'new@example.com',
        sent: new Date('2024-04-01T00:00:00.000Z'),
        ip: null,
        user_agent: null,
    })

    // Request resend (composite key: [contact, message])
    await db1.put('request_resend', {
        contact: contact_id,
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
        groups: [group_id],
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
    expect(json2).toBe(json)
})

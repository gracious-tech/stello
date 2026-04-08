// WARN AI GENERATED - NOT REVIEWED YET

import 'fake-indexeddb/auto'  // WARN Must import before indexeddb accessed
import {test, expect} from '@playwright/test'

import {merge_contacts} from './contacts_merge'
import {migrate, migrate_async, DATABASE_VERSION} from './migrations'
import {open_db} from './migrations.test_utils'
import {RecordContact} from './types'


// HELPERS


async function fresh_db(label: string) {
    // Open a fresh in-memory database at latest version for a given test label
    return open_db(`merge_contacts_${label}`, DATABASE_VERSION, migrate, migrate_async)
}

function make_contact(id: string, overrides: Partial<RecordContact> = {}): RecordContact {
    // Create a minimal contact record for testing
    return {
        id,
        created: new Date('2020-01-01'),
        name: id,
        name_hello: '',
        address: 'test@example.com',
        notes: '',
        service_account: null,
        service_id: null,
        multiple: false,
        ...overrides,
    }
}


// TESTS


test.describe('merge_contacts', () => {

    test('merges_notes_from_all_contacts', async () => {
        // Notes from primary and secondaries are concatenated with newlines
        const db = await fresh_db('merges_notes')
        await db.put('contacts', make_contact('primary', {notes: 'primary note'}))
        await db.put('contacts', make_contact('s1', {notes: 'second note'}))
        await db.put('contacts', make_contact('s2', {notes: 'third note'}))

        await merge_contacts(db, 'primary', ['s1', 's2'])

        const result = await db.get('contacts', 'primary')
        expect(result!.notes).toBe('primary note\n\nsecond note\n\nthird note')
    })

    test('skips_blank_notes_when_merging', async () => {
        // Blank/whitespace notes are excluded from the concatenation
        const db = await fresh_db('skips_blank_notes')
        await db.put('contacts', make_contact('primary', {notes: 'keep this'}))
        await db.put('contacts', make_contact('s1', {notes: '   '}))

        await merge_contacts(db, 'primary', ['s1'])

        const result = await db.get('contacts', 'primary')
        expect(result!.notes).toBe('keep this')
    })

    test('does_not_modify_service_account_primary', async () => {
        // Service account primary contact record must not be changed
        const db = await fresh_db('service_primary')
        await db.put('contacts', make_contact('primary', {
            notes: 'original',
            service_account: 'google:123',
        }))
        await db.put('contacts', make_contact('s1', {notes: 'other'}))

        await merge_contacts(db, 'primary', ['s1'])

        const result = await db.get('contacts', 'primary')
        expect(result!.notes).toBe('original')
    })

    test('deletes_internal_secondary', async () => {
        // Internal (non-service) secondary contacts are deleted
        const db = await fresh_db('deletes_internal')
        await db.put('contacts', make_contact('primary'))
        await db.put('contacts', make_contact('s1'))

        await merge_contacts(db, 'primary', ['s1'])

        expect(await db.get('contacts', 's1')).toBeUndefined()
    })

    test('does_not_delete_service_account_secondary', async () => {
        // Service account secondary contacts must not be deleted
        const db = await fresh_db('keeps_service_secondary')
        await db.put('contacts', make_contact('primary'))
        await db.put('contacts', make_contact('s1', {service_account: 'google:123'}))

        await merge_contacts(db, 'primary', ['s1'])

        expect(await db.get('contacts', 's1')).toBeDefined()
    })

    test('updates_group_contacts', async () => {
        // Secondary id in a group's contacts array is replaced with primary id
        const db = await fresh_db('updates_groups')
        await db.put('contacts', make_contact('primary'))
        await db.put('contacts', make_contact('s1'))
        await db.put('groups', {
            id: 'g1', name: 'G', contacts: ['s1', 'other'], service_account: null, service_id: null,
        })

        await merge_contacts(db, 'primary', ['s1'])

        const group = await db.get('groups', 'g1')
        expect(group!.contacts).toEqual(['primary', 'other'])
    })

    test('deduplicates_group_contacts_when_primary_already_present', async () => {
        // If primary is already in the group, secondary is removed without adding a duplicate
        const db = await fresh_db('deduplicates_groups')
        await db.put('contacts', make_contact('primary'))
        await db.put('contacts', make_contact('s1'))
        await db.put('groups', {
            id: 'g1', name: 'G', contacts: ['primary', 's1'],
            service_account: null, service_id: null,
        })

        await merge_contacts(db, 'primary', ['s1'])

        const group = await db.get('groups', 'g1')
        expect(group!.contacts).toEqual(['primary'])
    })

    test('updates_draft_include_contacts', async () => {
        // Secondary id in draft include_contacts is replaced with primary id
        const db = await fresh_db('updates_draft_include')
        await db.put('contacts', make_contact('primary'))
        await db.put('contacts', make_contact('s1'))
        await db.put('drafts', {
            id: 'd1', template: false, reply_to: null, modified: new Date(), title: '',
            sections: [], profile: null,
            options_identity: {
                sender_name: '', invite_image: null, invite_tmpl_email: null,
                invite_tmpl_clipboard: null, invite_button: '',
            },
            options_security: {lifespan: null, max_reads: null},
            recipients: {
                include_groups: [], include_contacts: ['s1'],
                exclude_groups: [], exclude_contacts: [],
            },
        })

        await merge_contacts(db, 'primary', ['s1'])

        const draft = await db.get('drafts', 'd1')
        expect(draft!.recipients.include_contacts).toEqual(['primary'])
    })

    test('updates_draft_exclude_contacts', async () => {
        // Secondary id in draft exclude_contacts is replaced with primary id
        const db = await fresh_db('updates_draft_exclude')
        await db.put('contacts', make_contact('primary'))
        await db.put('contacts', make_contact('s1'))
        await db.put('drafts', {
            id: 'd1', template: false, reply_to: null, modified: new Date(), title: '',
            sections: [], profile: null,
            options_identity: {
                sender_name: '', invite_image: null, invite_tmpl_email: null,
                invite_tmpl_clipboard: null, invite_button: '',
            },
            options_security: {lifespan: null, max_reads: null},
            recipients: {
                include_groups: [], include_contacts: [],
                exclude_groups: [], exclude_contacts: ['s1'],
            },
        })

        await merge_contacts(db, 'primary', ['s1'])

        const draft = await db.get('drafts', 'd1')
        expect(draft!.recipients.exclude_contacts).toEqual(['primary'])
    })

    test('updates_message_draft_recipients', async () => {
        // Secondary id in a published message's embedded draft recipients is replaced with primary
        const db = await fresh_db('updates_message_draft')
        await db.put('contacts', make_contact('primary'))
        await db.put('contacts', make_contact('s1'))
        const base_draft = {
            id: 'm1', template: false as const, reply_to: null, modified: new Date(), title: '',
            sections: [], profile: 'p1',
            options_identity: {
                sender_name: '', invite_image: null, invite_tmpl_email: null,
                invite_tmpl_clipboard: null, invite_button: '',
            },
            options_security: {lifespan: null, max_reads: null},
            recipients: {
                include_groups: [], include_contacts: ['s1'],
                exclude_groups: [], exclude_contacts: [],
            },
        }
        await db.put('messages', {
            id: 'm1', published: new Date(), expired: false, lifespan: 0, max_reads: 0,
            assets_key: null, assets_uploaded: {}, draft: base_draft,
        })

        await merge_contacts(db, 'primary', ['s1'])

        const message = await db.get('messages', 'm1')
        expect(message!.draft.recipients.include_contacts).toEqual(['primary'])
    })

    test('updates_copies', async () => {
        // Message copy contact_id is updated to primary
        const db = await fresh_db('updates_copies')
        await db.put('contacts', make_contact('primary'))
        await db.put('contacts', make_contact('s1'))
        await db.put('copies', {
            id: 'copy1', msg_id: 'msg1', secret: null, secret_sse: null, resp_token: 'tok',
            uploaded: false, uploaded_latest: false, invited: null, expired: false,
            contact_id: 's1', contact_name: '', contact_hello: '',
            contact_address: '', contact_multiple: false,
        })

        await merge_contacts(db, 'primary', ['s1'])

        const copy = await db.get('copies', 'copy1')
        expect(copy!.contact_id).toBe('primary')
    })

    test('updates_replies', async () => {
        // Reply contact_id is updated to primary
        const db = await fresh_db('updates_replies')
        await db.put('contacts', make_contact('primary'))
        await db.put('contacts', make_contact('s1'))
        await db.put('replies', {
            id: 'r1', sent: new Date(), ip: null, user_agent: null, copy_id: null, msg_id: null,
            msg_title: null, contact_id: 's1', contact_name: null, section_id: null,
            subsection_id: null, content: 'hi', read: false, replied: false, archived: false,
        })

        await merge_contacts(db, 'primary', ['s1'])

        const reply = await db.get('replies', 'r1')
        expect(reply!.contact_id).toBe('primary')
    })

    test('updates_reactions', async () => {
        // Reaction contact_id is updated to primary
        const db = await fresh_db('updates_reactions')
        await db.put('contacts', make_contact('primary'))
        await db.put('contacts', make_contact('s1'))
        await db.put('reactions', {
            id: 'rx1', sent: new Date(), ip: null, user_agent: null, copy_id: 'c1', msg_id: 'm1',
            msg_title: null, contact_id: 's1', contact_name: null, section_id: 'sec1',
            subsection_id: null, content: ':)', read: false, replied: false, archived: false,
        })

        await merge_contacts(db, 'primary', ['s1'])

        const reaction = await db.get('reactions', 'rx1')
        expect(reaction!.contact_id).toBe('primary')
    })

    test('migrates_unsubscribes_to_primary', async () => {
        // Unsubscribe record for secondary is moved to primary
        const db = await fresh_db('migrates_unsubs')
        await db.put('contacts', make_contact('primary'))
        await db.put('contacts', make_contact('s1'))
        await db.put('unsubscribes', {
            profile: 'p1', contact: 's1', sent: new Date(), ip: null, user_agent: null,
        })

        await merge_contacts(db, 'primary', ['s1'])

        expect(await db.get('unsubscribes', ['p1', 's1'])).toBeUndefined()
        const migrated = await db.get('unsubscribes', ['p1', 'primary'])
        expect(migrated).toBeDefined()
    })

    test('no_duplicate_unsubscribe_when_primary_already_has_one', async () => {
        // If primary already has an unsubscribe for a profile, secondary's is just deleted
        const db = await fresh_db('no_dup_unsubs')
        await db.put('contacts', make_contact('primary'))
        await db.put('contacts', make_contact('s1'))
        await db.put('unsubscribes', {
            profile: 'p1', contact: 'primary', sent: new Date('2020-01-01'),
            ip: null, user_agent: null,
        })
        await db.put('unsubscribes', {
            profile: 'p1', contact: 's1', sent: new Date('2021-01-01'), ip: null, user_agent: null,
        })

        await merge_contacts(db, 'primary', ['s1'])

        // Secondary's unsub is gone; primary's original unsub is intact
        expect(await db.get('unsubscribes', ['p1', 's1'])).toBeUndefined()
        const kept = await db.get('unsubscribes', ['p1', 'primary'])
        expect(kept!.sent).toEqual(new Date('2020-01-01'))
    })

    test('migrates_request_address_to_primary', async () => {
        // request_address record for secondary is moved to primary
        const db = await fresh_db('migrates_req_addr')
        await db.put('contacts', make_contact('primary'))
        await db.put('contacts', make_contact('s1'))
        await db.put('request_address', {
            contact: 's1', old_address: 'old@x.com', new_address: 'new@x.com',
            sent: new Date(), ip: null, user_agent: null,
        })

        await merge_contacts(db, 'primary', ['s1'])

        expect(await db.get('request_address', 's1')).toBeUndefined()
        const migrated = await db.get('request_address', 'primary')
        expect(migrated?.new_address).toBe('new@x.com')
    })

    test('does_not_overwrite_existing_request_address_for_primary', async () => {
        // If primary already has a request_address, secondary's is discarded
        const db = await fresh_db('keeps_primary_req_addr')
        await db.put('contacts', make_contact('primary'))
        await db.put('contacts', make_contact('s1'))
        await db.put('request_address', {
            contact: 'primary', old_address: 'orig@x.com', new_address: 'keep@x.com',
            sent: new Date(), ip: null, user_agent: null,
        })
        await db.put('request_address', {
            contact: 's1', old_address: 'old@x.com', new_address: 'discard@x.com',
            sent: new Date(), ip: null, user_agent: null,
        })

        await merge_contacts(db, 'primary', ['s1'])

        const kept = await db.get('request_address', 'primary')
        expect(kept!.new_address).toBe('keep@x.com')
    })

    test('migrates_request_resend_to_primary', async () => {
        // request_resend record for secondary is moved under primary
        const db = await fresh_db('migrates_req_resend')
        await db.put('contacts', make_contact('primary'))
        await db.put('contacts', make_contact('s1'))
        await db.put('request_resend', {
            contact: 's1', message: 'msg1', reason: 'bounce',
            sent: new Date(), ip: null, user_agent: null,
        })

        await merge_contacts(db, 'primary', ['s1'])

        expect(await db.get('request_resend', ['s1', 'msg1'])).toBeUndefined()
        expect(await db.get('request_resend', ['primary', 'msg1'])).toBeDefined()
    })

    test('no_duplicate_request_resend_when_primary_already_has_one', async () => {
        // If primary already has a resend for the same message, secondary's is discarded
        const db = await fresh_db('no_dup_resend')
        await db.put('contacts', make_contact('primary'))
        await db.put('contacts', make_contact('s1'))
        await db.put('request_resend', {
            contact: 'primary', message: 'msg1', reason: 'original',
            sent: new Date(), ip: null, user_agent: null,
        })
        await db.put('request_resend', {
            contact: 's1', message: 'msg1', reason: 'duplicate',
            sent: new Date(), ip: null, user_agent: null,
        })

        await merge_contacts(db, 'primary', ['s1'])

        expect(await db.get('request_resend', ['s1', 'msg1'])).toBeUndefined()
        const kept = await db.get('request_resend', ['primary', 'msg1'])
        expect(kept!.reason).toBe('original')
    })

})


import {IDBPTransaction, StoreNames} from 'idb'

// WARN Careful importing/using anything external (embed instead so that migrations stay consistent)
import {AppDatabaseSchema, RecordProfile} from './types'


type VersionChangeTransaction = IDBPTransaction<
    AppDatabaseSchema,
    StoreNames<AppDatabaseSchema>[],
    'versionchange'
>


export const DATABASE_VERSION = 9


export function migrate(transaction:VersionChangeTransaction, old_version:number){
    // Begin upgrade at whichever version is already present (no break statements)
    // WARN Ensure all versions accounted for, or none will match
    switch (old_version){
        default:
            throw new Error("Database version unknown (should never happen)")
        case 0:  // Version number when db doesn't exist
            to1(transaction)
        case 1:
            to2(transaction)
        case 2:
            to3(transaction)
        case 3:
            to4(transaction)
        case 4:
            to5(transaction)
        case 5:
            to6(transaction)
        case 6:
            to7(transaction)
        case 7:
            to8(transaction)
        case 8:
            to9(transaction)
    }
}


async function to1(transaction:VersionChangeTransaction){

    // Create object stores
    // NOTE If no keyPath is given then must provide a key for every transaction
    const state = transaction.db.createObjectStore('state', {keyPath: 'key'})
    const contacts = transaction.db.createObjectStore('contacts', {keyPath: 'id'})
    const groups = transaction.db.createObjectStore('groups', {keyPath: 'id'})
    const profiles = transaction.db.createObjectStore('profiles', {keyPath: 'id'})
    const drafts = transaction.db.createObjectStore('drafts', {keyPath: 'id'})
    const messages = transaction.db.createObjectStore('messages', {keyPath: 'id'})
    const copies = transaction.db.createObjectStore('copies', {keyPath: 'id'})
    const sections = transaction.db.createObjectStore('sections', {keyPath: 'id'})
    const reads = transaction.db.createObjectStore('reads', {keyPath: 'id'})
    const replies = transaction.db.createObjectStore('replies', {keyPath: 'id'})
    const reactions = transaction.db.createObjectStore('reactions', {keyPath: 'id'})

    // Create indexes
    copies.createIndex('by_msg', 'msg_id')
    copies.createIndex('by_contact', 'contact_id')
    copies.createIndex('by_resp_token', 'resp_token')
    reads.createIndex('by_msg', 'msg_id')
    replies.createIndex('by_msg', 'msg_id')
    replies.createIndex('by_contact', 'contact_id')
    reactions.createIndex('by_msg', 'msg_id')
    reactions.createIndex('by_contact', 'contact_id')
}


async function to2(transaction:VersionChangeTransaction){

    // Changes to profiles
    for await (const cursor of transaction.objectStore('profiles')){
        // Unintentionally saved in db in v0.0.4 and below
        delete (cursor.value as any).smtp_providers
        // Previously saved smtp port as string by mistake
        // @ts-ignore since port may be string
        cursor.value.smtp.port = parseInt(cursor.value.smtp.port, 10) || null
        // New property added after v0.0.4 (previously true if port 587)
        cursor.value.smtp.starttls = cursor.value.smtp.port === 587
        // Save changes
        cursor.update(cursor.value)
    }
}


async function to3(transaction:VersionChangeTransaction){

    // half_width property removed from RecordSection post v0.1.1
    for await (const cursor of transaction.objectStore('sections')){
        delete (cursor.value as any).half_width
        cursor.update(cursor.value)
    }

    // sections became nested arrays post v0.1.1
    for await (const cursor of transaction.objectStore('drafts')){
        // @ts-ignore old structure was string[]
        cursor.value.sections = cursor.value.sections.map(s => [s])
        cursor.update(cursor.value)
    }
    for await (const cursor of transaction.objectStore('messages')){
        // @ts-ignore old structure was string[]
        cursor.value.draft.sections = cursor.value.draft.sections.map(s => [s])
        cursor.update(cursor.value)
    }
}


async function to4(transaction:VersionChangeTransaction){

    // New table for oauths
    const oauths = transaction.db.createObjectStore('oauths', {keyPath: 'id'})
    oauths.createIndex('by_issuer_id', ['issuer', 'issuer_id'])

    // New properties for contacts and groups
    for await (const cursor of transaction.objectStore('contacts')){
        cursor.value.service_account = null
        cursor.value.service_id = null
        cursor.update(cursor.value)
    }
    for await (const cursor of transaction.objectStore('groups')){
        cursor.value.service_account = null
        cursor.value.service_id = null
        cursor.update(cursor.value)
    }

    // New index for contacts and groups
    transaction.objectStore('contacts').createIndex(
        'by_service_account', 'service_account')
    transaction.objectStore('groups').createIndex(
        'by_service_account', 'service_account')

    // New property for profiles
    for await (const cursor of transaction.objectStore('profiles')){
        cursor.value.smtp.oauth = null
        cursor.update(cursor.value)
    }
}


async function to5(transaction:VersionChangeTransaction){

    // Order of steps changed so reset all progress to start (settings still saved)
    const profiles:Record<string, RecordProfile> = {}
    for await (const cursor of transaction.objectStore('profiles')){
        profiles[cursor.value.id] = cursor.value
        if (cursor.value.setup_step !== null){  // i.e. not fully setup yet
            cursor.value.setup_step = 0
            cursor.update(cursor.value)
        }
    }

    for await (const cursor of transaction.objectStore('messages')){

        // Previously didn't store determined expiration values on messages
        // NOTE Slight chance profile may have changed or been deleted but low risk
        const profile = profiles[cursor.value.draft.profile]
        cursor.value.lifespan = cursor.value.draft.options_security.lifespan
            ?? profile?.msg_options_security.lifespan ?? Infinity
        cursor.value.max_reads = cursor.value.draft.options_security.max_reads
            ?? profile?.msg_options_security.max_reads ?? Infinity

        // Add new expired property
        cursor.value.expired = false

        cursor.update(cursor.value)
    }

    // Add new expired property to copies
    for await (const cursor of transaction.objectStore('copies')){
        cursor.value.expired = false
        cursor.update(cursor.value)
    }

    // Add new respondable property to sections
    for await (const cursor of transaction.objectStore('sections')){
        cursor.value.respondable = true  // Previously always true though new default is null
        cursor.update(cursor.value)
    }
}


async function to6(transaction:VersionChangeTransaction):Promise<void>{

    // Changes to replies and reactions
    // Added `subsection_id` to replies and reactions
    // Also added `replied` and `archived` to reactions (matching replies model)
    // And set `archived` to value of `read` since previously functioned like `archive` now does
    // And set `read` to true since all old replies likely to have already been read
    for await (const cursor of transaction.objectStore('replies')){
        cursor.value.subsection_id = null
        cursor.value.archived = cursor.value.read
        cursor.value.read = true
        cursor.update(cursor.value)
    }
    for await (const cursor of transaction.objectStore('reactions')){
        cursor.value.subsection_id = null
        cursor.value.replied = false
        cursor.value.archived = cursor.value.read
        cursor.value.read = true
        cursor.update(cursor.value)
    }

    // New option in profiles
    for await (const cursor of transaction.objectStore('profiles')){
        cursor.value.options.reaction_options =
            ['like', 'love', 'yay', 'pray', 'laugh', 'wow', 'sad'],
        cursor.update(cursor.value)
    }
}


async function to7(transaction:VersionChangeTransaction):Promise<void>{

    // New caption property for videos
    for await (const cursor of transaction.objectStore('sections')){
        if (cursor.value.content.type === 'video'){
            cursor.value.content.caption = ''
            cursor.update(cursor.value)
        }
    }
}


async function to8(transaction:VersionChangeTransaction):Promise<void>{

    for await (const cursor of transaction.objectStore('profiles')){
        // Order of profile setup steps changed
        if (cursor.value.setup_step === 4){
            cursor.value.setup_step = 3
        }
        // Template variables changed
        cursor.value.msg_options_identity.invite_tmpl_email =
            cursor.value.msg_options_identity.invite_tmpl_email
            .replaceAll('CONTACT', '<span data-mention data-id="contact_hello"></span>')
            .replaceAll('SENDER', '<span data-mention data-id="sender_name"></span>')
            .replaceAll('SUBJECT', '<span data-mention data-id="msg_title"></span>')
            .replaceAll('LINK', '')  // Already resolved to blank post v0.1.1
        cursor.update(cursor.value)
    }
}


async function to9(transaction:VersionChangeTransaction):Promise<void>{

    // `invite_image` added to `msg_options_identity`
    const default_invite_image = await (await fetch('migrations/default_invite_image.jpg')).blob()
    for await (const cursor of transaction.objectStore('profiles')){
        cursor.value.msg_options_identity.invite_image = default_invite_image
        // Also added reply defaults to general options
        cursor.value.options.reply_invite_image = default_invite_image
        cursor.value.options.reply_invite_tmpl_email = `
            <p>Hi <span data-mention data-id='contact_hello'></span>,</p>
            <p><span data-mention data-id='sender_name'></span> has replied to you.</p>
        `
        // Removed `credentials_responder`
        // @ts-ignore key no longer exists
        delete cursor.value.host.credentials_responder
        // Added `secret`
        cursor.value.host_state.secret = await crypto.subtle.generateKey(
            {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt'])
        // Save changes
        cursor.update(cursor.value)
    }
    for await (const cursor of transaction.objectStore('drafts')){
        cursor.value.options_identity.invite_image = null
        cursor.update(cursor.value)
    }
    for await (const cursor of transaction.objectStore('messages')){
        cursor.value.draft.options_identity.invite_image = null
        cursor.update(cursor.value)
    }

    // `secret_sse` added to copies
    for await (const cursor of transaction.objectStore('copies')){
        cursor.value.secret_sse = await crypto.subtle.generateKey(
            {name: 'AES-GCM', length: 256}, true, ['encrypt'])
        cursor.update(cursor.value)
    }
}

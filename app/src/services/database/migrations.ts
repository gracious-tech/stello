// Migrations use fallthrough switch, async pattern, and change no longer existing properties
/* eslint-disable no-fallthrough */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-explicit-any */


import {IDBPTransaction, StoreNames} from 'idb'

// WARN Careful importing/using anything external (embed instead so that migrations stay consistent)
import {request_blob} from '../utils/http'
import {AppDatabaseSchema, RecordProfile} from './types'


type VersionChangeTransaction = IDBPTransaction<
    AppDatabaseSchema,
    StoreNames<AppDatabaseSchema>[],
    'versionchange'
>


export const DATABASE_VERSION = 11


export function migrate(transaction:VersionChangeTransaction, old_version:number):void{
    // Begin upgrade at whichever version is already present (no break statements)
    // WARN Ensure all versions accounted for, or none will match
    // WARN Database waits for transaction actions to finish, not for this function to finish
    // WARN Do not await anything (except db methods) or transaction will close before done
    switch (old_version){
        default:
            throw new Error("Database version unknown (should never happen)")
        case 0:  // Version number when db doesn't exist
            void to1(transaction)
        case 1:
            void to2(transaction)
        case 2:
            void to3(transaction)
        case 3:
            void to4(transaction)
        case 4:
            void to5(transaction)
        case 5:
            void to6(transaction)
        case 6:
            void to7(transaction)
        case 7:
            void to8(transaction)
        case 8:
            void to9(transaction)
        case 9:
            void to10(transaction)
        case 10:
            void to11(transaction)
    }
}


async function to1(transaction:VersionChangeTransaction){

    // Create object stores
    // NOTE If no keyPath is given then must provide a key for every transaction
    transaction.db.createObjectStore('state', {keyPath: 'key'})
    transaction.db.createObjectStore('contacts', {keyPath: 'id'})
    transaction.db.createObjectStore('groups', {keyPath: 'id'})
    transaction.db.createObjectStore('profiles', {keyPath: 'id'})
    transaction.db.createObjectStore('drafts', {keyPath: 'id'})
    transaction.db.createObjectStore('messages', {keyPath: 'id'})
    transaction.db.createObjectStore('sections', {keyPath: 'id'})
    const copies = transaction.db.createObjectStore('copies', {keyPath: 'id'})
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
        delete (cursor.value as unknown as {smtp_providers:any}).smtp_providers
        // Previously saved smtp port as string by mistake
        cursor.value.smtp.port = parseInt(cursor.value.smtp.port as unknown as string, 10) || null
        // New property added after v0.0.4 (previously true if port 587)
        cursor.value.smtp.starttls = cursor.value.smtp.port === 587
        // Save changes
        void cursor.update(cursor.value)
    }
}


async function to3(transaction:VersionChangeTransaction){

    // half_width property removed from RecordSection post v0.1.1
    for await (const cursor of transaction.objectStore('sections')){
        delete (cursor.value as unknown as {half_width?:boolean}).half_width
        void cursor.update(cursor.value)
    }

    // sections became nested arrays post v0.1.1
    for await (const cursor of transaction.objectStore('drafts')){
        cursor.value.sections = (cursor.value.sections as unknown as string[]).map(s => [s])
        void cursor.update(cursor.value)
    }
    for await (const cursor of transaction.objectStore('messages')){
        cursor.value.draft.sections =
            (cursor.value.draft.sections as unknown as string[]).map(s => [s])
        void cursor.update(cursor.value)
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
        void cursor.update(cursor.value)
    }
    for await (const cursor of transaction.objectStore('groups')){
        cursor.value.service_account = null
        cursor.value.service_id = null
        void cursor.update(cursor.value)
    }

    // New index for contacts and groups
    transaction.objectStore('contacts').createIndex(
        'by_service_account', 'service_account')
    transaction.objectStore('groups').createIndex(
        'by_service_account', 'service_account')

    // New property for profiles
    for await (const cursor of transaction.objectStore('profiles')){
        cursor.value.smtp.oauth = null
        void cursor.update(cursor.value)
    }
}


async function to5(transaction:VersionChangeTransaction){

    // Order of steps changed so reset all progress to start (settings still saved)
    const profiles:Record<string, RecordProfile> = {}
    for await (const cursor of transaction.objectStore('profiles')){
        profiles[cursor.value.id] = cursor.value
        if (cursor.value.setup_step !== null){  // i.e. not fully setup yet
            cursor.value.setup_step = 0
            void cursor.update(cursor.value)
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

        void cursor.update(cursor.value)
    }

    // Add new expired property to copies
    for await (const cursor of transaction.objectStore('copies')){
        cursor.value.expired = false
        void cursor.update(cursor.value)
    }

    // Add new respondable property to sections
    for await (const cursor of transaction.objectStore('sections')){
        cursor.value.respondable = true  // Previously always true though new default is null
        void cursor.update(cursor.value)
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
        void cursor.update(cursor.value)
    }
    for await (const cursor of transaction.objectStore('reactions')){
        cursor.value.subsection_id = null
        cursor.value.replied = false
        cursor.value.archived = cursor.value.read
        cursor.value.read = true
        void cursor.update(cursor.value)
    }

    // New option in profiles
    for await (const cursor of transaction.objectStore('profiles')){
        cursor.value.options.reaction_options =
            ['like', 'love', 'yay', 'pray', 'laugh', 'wow', 'sad'],
        void cursor.update(cursor.value)
    }
}


async function to7(transaction:VersionChangeTransaction):Promise<void>{

    // New caption property for videos
    for await (const cursor of transaction.objectStore('sections')){
        if (cursor.value.content.type === 'video'){
            cursor.value.content.caption = ''
            void cursor.update(cursor.value)
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
        void cursor.update(cursor.value)
    }
}


async function to9(transaction:VersionChangeTransaction):Promise<void>{

    // Added reply template to profiles, and removed credentials for responder
    for await (const cursor of transaction.objectStore('profiles')){
        cursor.value.options.reply_invite_tmpl_email = `
            <p>Hi <span data-mention data-id='contact_hello'></span>,</p>
            <p><span data-mention data-id='sender_name'></span> has replied to you.</p>
        `
        delete (cursor.value.host as unknown as {credentials_responder:any}).credentials_responder
        // Save changes
        void cursor.update(cursor.value)
    }

    // Invite image property added to drafts
    for await (const cursor of transaction.objectStore('drafts')){
        cursor.value.options_identity.invite_image = null
        void cursor.update(cursor.value)
    }
    for await (const cursor of transaction.objectStore('messages')){
        cursor.value.draft.options_identity.invite_image = null
        void cursor.update(cursor.value)
    }

    // New store for unsubscribes
    const unsubscribes = transaction.db.createObjectStore('unsubscribes',
        {keyPath: ['profile', 'contact']})
    unsubscribes.createIndex('by_profile', 'profile')
    unsubscribes.createIndex('by_contact', 'contact')

    // New stores for requests
    transaction.db.createObjectStore('request_address', {keyPath: 'contact'})
    transaction.db.createObjectStore('request_resend', {keyPath: ['contact', 'message']})

    // New `multiple` property for contacts and copies
    for await (const cursor of transaction.objectStore('contacts')){
        cursor.value.multiple = false
        void cursor.update(cursor.value)
    }
    for await (const cursor of transaction.objectStore('copies')){
        cursor.value.contact_multiple = false
        void cursor.update(cursor.value)
    }

    // New index for contacts
    transaction.objectStore('contacts').createIndex('by_address', 'address')

    // Post-upgrade migrations
    // WARN Only start once upgrade transaction finished, otherwise could overwrite previous changes
    // WARN App will not wait for these to complete before mounting
    const db = transaction.db
    void transaction.done.then(async () => {

        // `secret_sse` added to copies
        for (const copy of await db.getAll('copies')){
            copy.secret_sse = await crypto.subtle.generateKey(
                {name: 'AES-GCM', length: 256}, true, ['encrypt'])
            void db.put('copies', copy)
        }

        // Invite image and secret added to profiles
        const profiles = await db.getAll('profiles')
        if (profiles.length){
            const default_invite_image = await request_blob('migrations/default_invite_image.jpg')
            for (const profile of profiles){
                profile.msg_options_identity.invite_image = default_invite_image
                profile.options.reply_invite_image = default_invite_image
                profile.host_state.secret = await crypto.subtle.generateKey(
                    {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt'])
                void db.put('profiles', profile)
            }
        }
    })
}


async function to10(transaction:VersionChangeTransaction):Promise<void>{

    // New `version` property added to configs, so all must be reuploaded
    for await (const cursor of transaction.objectStore('profiles')){
        cursor.value.host_state.displayer_config_uploaded = false
        cursor.value.host_state.responder_config_uploaded = false
        void cursor.update(cursor.value)
    }

    // Reaction ids now formed from their own properties
    for await (const cursor of transaction.objectStore('reactions')){
        // Recreate all reactions that have a copy_id with a new form of key
        if (cursor.value.copy_id){
            cursor.value.id =
                `${cursor.value.copy_id}-${cursor.value.section_id}-${cursor.value.subsection_id}`
            void cursor.source.put(cursor.value)  // Can't use `update()` since changing id
        }
        void cursor.delete()
    }
}


async function to11(transaction:VersionChangeTransaction):Promise<void>{

    // Delete microsoft oauth records since have changed client id
    const deleted_oauths = []
    for await (const cursor of transaction.objectStore('oauths')){
        if (cursor.value.issuer === 'microsoft'){
            deleted_oauths.push(cursor.value.id)
            void cursor.delete()
        }
    }

    // Remove affected oauths from profiles, forcing them to prompt for new email settings
    // NOTE Microsoft oauths up-till-now only used for email, not contacts
    for await (const cursor of transaction.objectStore('profiles')){
        if (deleted_oauths.includes(cursor.value.smtp.oauth ?? 'null')){
            cursor.value.smtp.oauth = null
            void cursor.update(cursor.value)
        }
    }

}

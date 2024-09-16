// Migrations before version 12 were not executed synchronously and had chance of overlapping
// So migrating to 12 is unusual in that it doesn't assume migrations have completed successfully
/* eslint-disable @typescript-eslint/no-explicit-any -- needed when prop no longer exists */

import {VersionChangeTransaction, AppDatabaseConnection, RecordProfile} from './types'


export async function to_12_from_1plus(transaction:VersionChangeTransaction, old_version:number){
    // All synchronous migrations from 1-12, refactored to be re-run safe
    await to2(transaction)
    await to3(transaction)
    await to4(transaction)
    await to5(transaction)
    await to6(transaction)
    await to7(transaction)
    await to8(transaction)
    await to9(transaction)
    await to10(transaction)
    await to11(transaction, old_version)
    await to12(transaction)
}


export async function to_12_from_1plus_async(db:AppDatabaseConnection){
    // All async migrations from 1-12

    // Applied for version 9
    for (const copy of await db.getAll('copies')){
        // `secret_sse` added to copies
        if (copy.secret_sse === undefined){
            copy.secret_sse = await self.crypto.subtle.generateKey(
                {name: 'AES-GCM', length: 256}, true, ['encrypt'])
            await db.put('copies', copy)
        }
    }
    const profiles = await db.getAll('profiles')
    if (profiles.length){
        // Invite image and secret added to profiles

        // Load default invite image into memory (set as string if testing in node)
        let default_invite_image:Blob = 'default_invite_image_blob' as unknown as Blob
        if (self.Blob){
            default_invite_image = new Blob(
                [await self.app_native.app_file_read('migrations/default_invite_image.jpg')],
                {type: 'image/jpeg'},
            )
        }

        for (const profile of profiles){
            if (profile.host_state.secret === undefined){
                profile.msg_options_identity.invite_image = default_invite_image
                profile.options.reply_invite_image = default_invite_image
                profile.host_state.secret = await self.crypto.subtle.generateKey(
                    {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt'])
                await db.put('profiles', profile)
            }
        }
    }
}


async function to2(transaction:VersionChangeTransaction){

    // Changes to profiles
    for await (const cursor of transaction.objectStore('profiles')){
        if (cursor.value.smtp.starttls === undefined){
            // Unintentionally saved in db in v0.0.4 and below
            delete (cursor.value as unknown as {smtp_providers:any}).smtp_providers
            // Previously saved smtp port as string by mistake
            cursor.value.smtp.port =
                parseInt(cursor.value.smtp.port as unknown as string, 10) || null
            // New property added after v0.0.4 (previously true if port 587)
            cursor.value.smtp.starttls = cursor.value.smtp.port === 587
            // Save changes
            await cursor.update(cursor.value)
        }
    }
}


async function to3(transaction:VersionChangeTransaction){

    // half_width property removed from RecordSection post v0.1.1
    for await (const cursor of transaction.objectStore('sections')){
        delete (cursor.value as unknown as {half_width?:boolean}).half_width
        await cursor.update(cursor.value)
    }

    // sections became nested arrays post v0.1.1
    for await (const cursor of transaction.objectStore('drafts')){
        if (typeof cursor.value.sections[0] === 'string'){
            cursor.value.sections = (cursor.value.sections as unknown as string[]).map(s => [s])
            await cursor.update(cursor.value)
        }
    }
    for await (const cursor of transaction.objectStore('messages')){
        if (typeof cursor.value.draft.sections[0] === 'string'){
            cursor.value.draft.sections =
                (cursor.value.draft.sections as unknown as string[]).map(s => [s])
            await cursor.update(cursor.value)
        }
    }
}


async function to4(transaction:VersionChangeTransaction){

    // New table for oauths
    if (!transaction.objectStoreNames.contains('oauths')){
        const oauths = transaction.db.createObjectStore('oauths', {keyPath: 'id'})
        oauths.createIndex('by_issuer_id', ['issuer', 'issuer_id'])
    }

    // New properties for contacts and groups
    for await (const cursor of transaction.objectStore('contacts')){
        if (cursor.value.service_account === undefined){
            cursor.value.service_account = null
            cursor.value.service_id = null
            await cursor.update(cursor.value)
        }
    }
    for await (const cursor of transaction.objectStore('groups')){
        if (cursor.value.service_account === undefined){
            cursor.value.service_account = null
            cursor.value.service_id = null
            await cursor.update(cursor.value)
        }
    }

    // New index for contacts and groups
    const contacts = transaction.objectStore('contacts')
    if (!contacts.indexNames.contains('by_service_account'))
        contacts.createIndex('by_service_account', 'service_account')
    const groups = transaction.objectStore('groups')
    if (!groups.indexNames.contains('by_service_account'))
        groups.createIndex('by_service_account', 'service_account')

    // New property for profiles
    for await (const cursor of transaction.objectStore('profiles')){
        if (cursor.value.smtp.oauth === undefined){
            cursor.value.smtp.oauth = null
            await cursor.update(cursor.value)
        }
    }
}


async function to5(transaction:VersionChangeTransaction){

    // Order of steps changed so reset all progress to start (settings still saved)
    // NOTE This is no big deal, so happens to all versions pre-12 (incomplete profiles only!)
    const profiles:Record<string, RecordProfile> = {}
    for await (const cursor of transaction.objectStore('profiles')){
        profiles[cursor.value.id] = cursor.value
        if (cursor.value.setup_step !== null){  // i.e. not fully setup yet
            cursor.value.setup_step = 0
            await cursor.update(cursor.value)
        }
    }

    for await (const cursor of transaction.objectStore('messages')){
        if (cursor.value.expired === undefined){

            // Previously didn't store determined expiration values on messages
            // NOTE Slight chance profile may have changed or been deleted but low risk
            const profile = profiles[cursor.value.draft.profile]
            cursor.value.lifespan = cursor.value.draft.options_security.lifespan
                ?? profile?.msg_options_security.lifespan ?? Infinity
            cursor.value.max_reads = cursor.value.draft.options_security.max_reads
                ?? profile?.msg_options_security.max_reads ?? Infinity

            // Add new expired property
            cursor.value.expired = false

            await cursor.update(cursor.value)
        }
    }

    // Add new expired property to copies
    for await (const cursor of transaction.objectStore('copies')){
        if (cursor.value.expired === undefined){
            cursor.value.expired = false
            await cursor.update(cursor.value)
        }
    }

    // Add new respondable property to sections
    for await (const cursor of transaction.objectStore('sections')){
        if (cursor.value.respondable === undefined){
            cursor.value.respondable = true  // Previously always true though new default is null
            await cursor.update(cursor.value)
        }
    }
}


async function to6(transaction:VersionChangeTransaction):Promise<void>{

    // Changes to replies and reactions
    // Added `subsection_id` to replies and reactions
    // Also added `replied` and `archived` to reactions (matching replies model)
    // And set `archived` to value of `read` since previously functioned like `archive` now does
    // And set `read` to true since all old replies likely to have already been read
    for await (const cursor of transaction.objectStore('replies')){
        if (cursor.value.subsection_id === undefined){
            cursor.value.subsection_id = null
            cursor.value.archived = cursor.value.read
            cursor.value.read = true
        }
        await cursor.update(cursor.value)
    }
    for await (const cursor of transaction.objectStore('reactions')){
        if (cursor.value.subsection_id === undefined){
            cursor.value.subsection_id = null
            cursor.value.replied = false
            cursor.value.archived = cursor.value.read
            cursor.value.read = true
            await cursor.update(cursor.value)
        }
    }

    // New option in profiles
    for await (const cursor of transaction.objectStore('profiles')){
        if (cursor.value.options.reaction_options === undefined){
            cursor.value.options.reaction_options =
                ['like', 'love', 'yay', 'pray', 'laugh', 'wow', 'sad'],
            await cursor.update(cursor.value)
        }
    }
}


async function to7(transaction:VersionChangeTransaction):Promise<void>{

    // New caption property for videos
    for await (const cursor of transaction.objectStore('sections')){
        if (cursor.value.content.type === 'video' && cursor.value.content.caption === undefined){
            cursor.value.content.caption = ''
            await cursor.update(cursor.value)
        }
    }
}


async function to8(transaction:VersionChangeTransaction):Promise<void>{

    for await (const cursor of transaction.objectStore('profiles')){
        // Order of profile setup steps changed
        // NOTE Below no longer relevant since earlier migration resets all to 0 anyway
        // if (cursor.value.setup_step === 4){
        //     cursor.value.setup_step = 3
        // }

        // Template variables changed
        if (!cursor.value.msg_options_identity.invite_tmpl_email.includes('data-mention')){
            cursor.value.msg_options_identity.invite_tmpl_email =
                cursor.value.msg_options_identity.invite_tmpl_email
                    .replaceAll('CONTACT', '<span data-mention data-id="contact_hello"></span>')
                    .replaceAll('SENDER', '<span data-mention data-id="sender_name"></span>')
                    .replaceAll('SUBJECT', '<span data-mention data-id="msg_title"></span>')
                    .replaceAll('LINK', '')  // Already resolved to blank post v0.1.1
            await cursor.update(cursor.value)
        }
    }
}


async function to9(transaction:VersionChangeTransaction):Promise<void>{

    // Added reply template to profiles, and removed credentials for responder
    for await (const cursor of transaction.objectStore('profiles')){
        if (cursor.value.options.reply_invite_tmpl_email === undefined){
            cursor.value.options.reply_invite_tmpl_email =
                "<p>Hi <span data-mention data-id='contact_hello'></span>,</p>"
                + "<p><span data-mention data-id='sender_name'></span> has replied to you.</p>"
            delete (cursor.value.host as any as {credentials_responder:any}).credentials_responder
            await cursor.update(cursor.value)
        }
    }

    // Invite image property added to drafts
    for await (const cursor of transaction.objectStore('drafts')){
        if (cursor.value.options_identity.invite_image === undefined){
            cursor.value.options_identity.invite_image = null
            await cursor.update(cursor.value)
        }
    }
    for await (const cursor of transaction.objectStore('messages')){
        if (cursor.value.draft.options_identity.invite_image === undefined){
            cursor.value.draft.options_identity.invite_image = null
            await cursor.update(cursor.value)
        }
    }

    // New store for unsubscribes
    if (!transaction.objectStoreNames.contains('unsubscribes')){
        const unsubscribes = transaction.db.createObjectStore('unsubscribes',
            {keyPath: ['profile', 'contact']})
        unsubscribes.createIndex('by_profile', 'profile')
        unsubscribes.createIndex('by_contact', 'contact')
    }

    // New stores for requests
    if (!transaction.objectStoreNames.contains('request_address'))
        transaction.db.createObjectStore('request_address', {keyPath: 'contact'})
    if (!transaction.objectStoreNames.contains('request_resend'))
        transaction.db.createObjectStore('request_resend', {keyPath: ['contact', 'message']})

    // New `multiple` property for contacts and copies
    for await (const cursor of transaction.objectStore('contacts')){
        if (cursor.value.multiple === undefined){
            cursor.value.multiple = false
            await cursor.update(cursor.value)
        }
    }
    for await (const cursor of transaction.objectStore('copies')){
        if (cursor.value.contact_multiple === undefined){
            cursor.value.contact_multiple = false
            await cursor.update(cursor.value)
        }
    }

    // New index for contacts
    const contacts = transaction.objectStore('contacts')
    if (!contacts.indexNames.contains('by_address'))
        contacts.createIndex('by_address', 'address')
}


async function to10(transaction:VersionChangeTransaction):Promise<void>{

    // New `version` property added to configs, so all must be reuploaded
    // NOTE Reuploading is no big deal, so this happens for any version pre-12
    for await (const cursor of transaction.objectStore('profiles')){
        cursor.value.host_state.displayer_config_uploaded = false
        cursor.value.host_state.responder_config_uploaded = false
        await cursor.update(cursor.value)
    }

    // Reaction ids now formed from their own properties
    for await (const cursor of transaction.objectStore('reactions')){
        // Recreate all reactions that have a copy_id with a new form of key
        if (cursor.value.copy_id){
            const val = cursor.value
            const id = `${val.copy_id!}-${val.section_id ?? 'null'}-${val.subsection_id ?? 'null'}`
            if (val.id === id){
                continue  // Don't put or delete, id is already correct
            }
            val.id = id
            await cursor.source.put(cursor.value)  // Can't use `update()` since changing id
        }
        await cursor.delete()
    }
}


async function to11(transaction:VersionChangeTransaction, old_version:number):Promise<void>{

    // Gather existing oauth ids
    const oauth_ids = []
    for await (const cursor of transaction.objectStore('oauths')){
        if (old_version < 11 && cursor.value.issuer === 'microsoft'){
            // Delete microsoft oauth records since have changed client id
            await cursor.delete()
        } else {
            oauth_ids.push(cursor.value.id)
        }
    }

    // Remove old oauth refs from profiles, forcing them to prompt for new email settings
    // NOTE Microsoft oauths up-till-now only used for email, not contacts
    for await (const cursor of transaction.objectStore('profiles')){
        if (cursor.value.smtp.oauth && !oauth_ids.includes(cursor.value.smtp.oauth)){
            cursor.value.smtp.oauth = null
            await cursor.update(cursor.value)
        }
    }
}


async function to12(transaction:VersionChangeTransaction):Promise<void>{
    // No changes, version bumped only to trigger re-run of old migrations
}

/* eslint-disable @typescript-eslint/no-explicit-any -- needed when prop no longer exists */

// WARN Careful importing/using anything external (embed instead so that migrations stay consistent)

import {AppDatabaseConnection, VersionChangeTransaction} from './types'
import {to_12_from_1plus, to_12_from_1plus_async} from './migrations_pre12'


export const DATABASE_VERSION = 19


export async function migrate(transaction:VersionChangeTransaction,
        old_version:number):Promise<void>{
    // Do synchronous upgrades (have access to transaction but can't await anything except it)
    // WARN Database waits for transaction actions to finish, not for this function to finish
    // WARN MUST await db changes so migrations don't overlap (just don't await anything else)
    if (old_version < 12){
        await (old_version === 0 ? to_12_from_0(transaction)
            : to_12_from_1plus(transaction, old_version))
    }
    if (old_version < 13)
        await to_13(transaction)
    if (old_version < 14)
        await to_14(transaction)
    if (old_version < 15)
        await to_15(transaction)
    if (old_version < 16)
        await to_16(transaction)
    if (old_version < 17)
        await to_17(transaction)
    if (old_version < 18)
        await to_18(transaction)
    if (old_version < 19)
        await to_19(transaction)
}


export async function migrate_async(db:AppDatabaseConnection, old_version:number){
    // Do async upgrades (can await anything but must create own transactions)
    // WARN If these fail, app will not redo them on next open (version number already changed)
    if (old_version < 12 && old_version !== 0)
        await to_12_from_1plus_async(db)
    if (old_version < 14)
        await to_14_async(db)
}


// MIGRATIONS


export async function _to1_creates(transaction:VersionChangeTransaction){
    // Added version 1
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
    copies.createIndex('by_msg', 'msg_id')
    copies.createIndex('by_contact', 'contact_id')
    copies.createIndex('by_resp_token', 'resp_token')
    reads.createIndex('by_msg', 'msg_id')
    replies.createIndex('by_msg', 'msg_id')
    replies.createIndex('by_contact', 'contact_id')
    reactions.createIndex('by_msg', 'msg_id')
    reactions.createIndex('by_contact', 'contact_id')
}


async function _to4_creates(transaction:VersionChangeTransaction){
    // Added version 4
    const oauths = transaction.db.createObjectStore('oauths', {keyPath: 'id'})
    oauths.createIndex('by_issuer_id', ['issuer', 'issuer_id'])
    transaction.objectStore('contacts').createIndex('by_service_account', 'service_account')
    transaction.objectStore('groups').createIndex('by_service_account', 'service_account')
}


async function _to9_creates(transaction:VersionChangeTransaction){
    // Added version 9
    const unsubscribes = transaction.db.createObjectStore('unsubscribes',
        {keyPath: ['profile', 'contact']})
    unsubscribes.createIndex('by_profile', 'profile')
    unsubscribes.createIndex('by_contact', 'contact')
    transaction.db.createObjectStore('request_address', {keyPath: 'contact'})
    transaction.db.createObjectStore('request_resend', {keyPath: ['contact', 'message']})
    transaction.objectStore('contacts').createIndex('by_address', 'address')
}


export async function to_12_from_0(transaction:VersionChangeTransaction){
    // Initial setup of everything up to 12
    await _to1_creates(transaction)
    await _to4_creates(transaction)
    await _to9_creates(transaction)
}


export async function to_13(transaction:VersionChangeTransaction){

    // Removed manager_aws_key_secret from state store
    await transaction.objectStore('state').delete('manager_aws_key_secret')

    for await (const cursor of transaction.objectStore('profiles')){
        // Deal with old profiles
        // Update properties that can be copied to a new profile, but don't bother with others

        // Just delete profiles that still aren't setup yet
        if (cursor.value.setup_step !== null){
            await cursor.delete()
            continue
        }

        // Added generic_domain property to profiles
        cursor.value.options.generic_domain = true

        // Effectively disable old accounts by setting setup_step to 0 (and UI blocks editing)
        cursor.value.setup_step = 0

        // Save changes
        await cursor.update(cursor.value)
    }

}


export async function to_14(transaction:VersionChangeTransaction){
    // Added new plan property to gracious host object
    for await (const cursor of transaction.objectStore('profiles')){
        if (cursor.value.host?.cloud === 'gracious'){
            cursor.value.host.plan = 'c'  // Existing users all use plan 'c' so no logic needed
            await cursor.update(cursor.value)
        }
    }
}


export async function to_14_async(db:AppDatabaseConnection){
    // External encryption for oauth tokens and email password

    const null_buff = new ArrayBuffer(0)
    for (const profile of await db.getAll('profiles')){
        // Pass should be null if not yet set, otherwise an empty buffer to prompt for reauth
        if (profile.smtp.pass){
            profile.smtp.pass = await self.app_native.os_encrypt(
                profile.smtp.pass as unknown as string) ?? null_buff
        } else {
            profile.smtp.pass = null  // Now using null instead of empty string
        }
        await db.put('profiles', profile)
    }

    for (const oauth of await db.getAll('oauths')){
        // Tokens never null so use empty buffer if encryption not possible
        oauth.token_access =
            await self.app_native.os_encrypt(oauth.token_access as unknown as string) ?? null_buff
        oauth.token_refresh =
            await self.app_native.os_encrypt(oauth.token_refresh as unknown as string) ?? null_buff
        await db.put('oauths', oauth)
    }
}


export async function to_15(transaction:VersionChangeTransaction){
    // A user ended up with a completed setup but host `null`, possibly due to old code, so clear
    for await (const cursor of transaction.objectStore('profiles')){
        if (cursor.value.setup_step === null && cursor.value.host === null){
            await cursor.delete()
        }
    }
}


export async function to_16(transaction:VersionChangeTransaction){

    for await (const cursor of transaction.objectStore('profiles')){
        if ('disp_config_name' in cursor.value.host_state){  // Old beta property
            // Remove old profiles that use beta system
            await cursor.delete()
        } else {
            // Add theme options
            cursor.value.options.theme_style = 'modern'
            cursor.value.options.theme_color = {h: 210, s: 0.75, l: 0.75}
            await cursor.update(cursor.value)
        }
    }

    // section_num/section_type removed from reactions and replies
    for await (const cursor of transaction.objectStore('reactions')){
        delete (cursor.value as unknown as {section_num?:number}).section_num
        delete (cursor.value as unknown as {section_type?:string}).section_type
        await cursor.update(cursor.value)
    }
    for await (const cursor of transaction.objectStore('replies')){
        delete (cursor.value as unknown as {section_num?:number}).section_num
        delete (cursor.value as unknown as {section_type?:string}).section_type
        await cursor.update(cursor.value)
    }

    // Added hero property to image sections
    for await (const cursor of transaction.objectStore('sections')){
        if (cursor.value.content.type === 'images'){
            cursor.value.content.hero = false
            await cursor.update(cursor.value)
        }
    }
}


export async function to_17(transaction:VersionChangeTransaction){

    // Convert all <h1> (deprecated) to <h2>
    // NOTE invites unlikely to have headings so ignored (will default to <p> when edited)
    for await (const cursor of transaction.objectStore('sections')){
        if (cursor.value.content.type === 'text'){
            cursor.value.content.html =
                cursor.value.content.html.replace(/<(\/?\s*)h[1-6]/ig, '<$1h2')
            await cursor.update(cursor.value)
        }
    }

    // New allow_comments option for profiles
    for await (const cursor of transaction.objectStore('profiles')){
        cursor.value.options.allow_comments = cursor.value.options.allow_replies
        await cursor.update(cursor.value)
    }
}


export async function to_18(transaction:VersionChangeTransaction){

    // Add invite_button properties to profiles and drafts
    for await (const cursor of transaction.objectStore('profiles')){
        cursor.value.msg_options_identity.invite_button = "Open Message"
        cursor.value.options.reply_invite_button = "Open Reply"
        await cursor.update(cursor.value)
    }
    for await (const cursor of transaction.objectStore('drafts')){
        cursor.value.options_identity.invite_button = ''
        await cursor.update(cursor.value)
    }
    for await (const cursor of transaction.objectStore('messages')){
        cursor.value.draft.options_identity.invite_button = ''
        await cursor.update(cursor.value)
    }
}


export async function to_19(transaction:VersionChangeTransaction){

    // Add send_to_self to profiles
    for await (const cursor of transaction.objectStore('profiles')){
        // Default to link only as many existing users would have added themselves as a contact
        cursor.value.options.send_to_self = 'yes_without_email'
        await cursor.update(cursor.value)
    }

    // Add subscribe_forms and request_subscribe stores
    const subscribe_forms = transaction.db.createObjectStore('subscribe_forms', {keyPath: 'id'})
    subscribe_forms.createIndex('by_profile', 'profile')
    transaction.db.createObjectStore('request_subscribe', {keyPath: 'id'})
}

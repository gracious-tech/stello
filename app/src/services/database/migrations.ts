/* eslint-disable @typescript-eslint/no-explicit-any -- needed when prop no longer exists */

// WARN Careful importing/using anything external (embed instead so that migrations stay consistent)

import {AppDatabaseConnection, VersionChangeTransaction} from './types'
import {to_12_from_1plus, to_12_from_1plus_async} from './migrations_pre12'


export const DATABASE_VERSION = 13


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
}


export async function migrate_async(db:AppDatabaseConnection, old_version:number){
    // Do async upgrades (can await anything but must create own transactions)
    // WARN If these fail, app will not redo them on next open (version number already changed)
    if (old_version < 12 && old_version !== 0)
        await to_12_from_1plus_async(db)
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

    // Added max_lifespan to profiles
    for await (const cursor of transaction.objectStore('profiles')){
        cursor.value.host.max_lifespan = Infinity
        await cursor.update(cursor.value)
    }
}

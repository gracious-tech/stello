
import {buffer_to_base64, base64_to_buffer, string_to_utf8, utf8_to_string}
    from '@/services/utils/coding'
import {import_key_sym, import_key_asym} from '@/services/utils/crypt'
import type {RecordContact, RecordProfile, RecordDraft,
    RecordDraftPublished, RecordMessage, RecordMessageCopy} from '@/services/database/types'


// EXPORTED TYPES
// Each mirrors a DB record with non-JSON-native fields replaced by JSON-safe equivalents.


type ExportedDatabase = {
    version:number
    dbid:string
    tables:Record<string, unknown[]>
}

interface ExportedContact extends Omit<RecordContact, 'created'> {
    created:string
}

interface ExportedProfile extends Omit<RecordProfile, 'smtp'|'host_state'> {
    smtp: Omit<RecordProfile['smtp'], 'pass'> & {
        pass:string|null
    }
    host_state: Omit<RecordProfile['host_state'],
            'secret'|'secret_old'|'shared_secret'|'resp_key'|'resp_key_old'> & {
        secret:string
        secret_old:null
        shared_secret:string
        resp_key:{priv:string, pub:string}
        resp_key_old:null
    }
}

interface ExportedDraft extends Omit<RecordDraft, 'modified'> {
    modified:string
}

interface ExportedMessage extends Omit<RecordMessage, 'published'|'assets_key'|'draft'> {
    published:string
    assets_key:string
    draft:ExportedDraft
}

interface ExportedMessageCopy extends Omit<RecordMessageCopy, 'secret'|'secret_sse'> {
    secret:string
    secret_sse:string
}


// HELPERS - export
// Convert non-JSON-native DB field types to serializable equivalents


async function export_sym_key(key:CryptoKey):Promise<string>{
    // Export a symmetric (AES-GCM) key as raw bytes encoded as base64
    return buffer_to_base64(await crypto.subtle.exportKey('raw', key))
}

async function export_key_pair(pair:CryptoKeyPair):Promise<{priv:string, pub:string}>{
    // Export an RSA key pair: public key as SPKI, private key as PKCS8
    const pub = buffer_to_base64(await crypto.subtle.exportKey('spki', pair.publicKey))
    const priv = buffer_to_base64(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
    return {priv, pub}
}


// HELPERS - import
// Reverse the above conversions when restoring from JSON


function import_buf_nullable(s:string|null):ArrayBuffer|null{
    // Nullable base64 → ArrayBuffer, null passes through
    return s ? base64_to_buffer(s) : null
}

async function import_sym_key(s:string):Promise<CryptoKey>{
    // Re-import as extractable so it can be re-exported in future backups
    // NOTE Always extractable and allow both encrypt/decrypt, just in case
    return import_key_sym(base64_to_buffer(s), true, ['encrypt', 'decrypt'])
}

async function import_key_pair(obj:{priv:string, pub:string}):Promise<CryptoKeyPair>{
    // Restore an RSA key pair from SPKI (public) and PKCS8 (private) encoded as base64
    const pub = await import_key_asym(base64_to_buffer(obj.pub), true, ['encrypt'])
    const priv = await crypto.subtle.importKey(
        'pkcs8', base64_to_buffer(obj.priv), {name: 'RSA-OAEP', hash: 'SHA-256'}, true,
        ['decrypt'])
    return {privateKey: priv, publicKey: pub}
}


// PER-TABLE CONVERTERS - export
// Each function handles only the fields that can't round-trip through JSON natively.
// Tables with no special fields (groups, subscribe_forms, sections) are passed as-is.


function export_contact(r:RecordContact):ExportedContact{
    // Only `created` is non-JSON-native
    return {...r, created: r.created.toISOString()}
}

async function export_profile(r:RecordProfile):Promise<ExportedProfile>{
    // Async due to CryptoKey exports in host_state; smtp.pass is also an encrypted buffer
    const hs = r.host_state
    return {
        ...r,
        smtp: {...r.smtp, pass: null},  // smtp.pass not backed up for security
        host_state: {
            ...hs,
            secret: await export_sym_key(hs.secret),
            secret_old: null,  // Old keys are non-extractable
            shared_secret: await export_sym_key(hs.shared_secret),
            resp_key: await export_key_pair(hs.resp_key),
            resp_key_old: null,  // Old keys are non-extractable
        },
    }
}

function export_draft(r:RecordDraft):ExportedDraft{
    // Only modified is non-JSON-native
    return {...r, modified: r.modified.toISOString()}
}

async function export_message(r:RecordMessage):Promise<ExportedMessage>{
    // Async due to assets_key export; also converts published date and embedded draft
    return {
        ...r,
        published: r.published.toISOString(),
        assets_key: await export_sym_key(r.assets_key),
        // draft is an embedded copy of the RecordDraft — convert its Date too
        draft: export_draft(r.draft),
    }
}

async function export_copy(r:RecordMessageCopy):Promise<ExportedMessageCopy>{
    // Async due to CryptoKey exports for both per-copy secrets
    return {
        ...r,
        secret: await export_sym_key(r.secret),
        secret_sse: await export_sym_key(r.secret_sse),
    }
}

function export_generic_with_sent<T extends {sent:Date}>(r:T):Omit<T, 'sent'> & {sent:string}{
    // Export a record that has standard JSON-compatible values except for "sent" date prop
    // This is the case for several response-related records
    return {...r, sent: r.sent.toISOString()}
}


// PER-TABLE CONVERTERS - import


function import_contact(r:ExportedContact):RecordContact{
    // Restore created date
    return {...r, created: new Date(r.created)}
}

async function import_profile(r:ExportedProfile):Promise<RecordProfile>{
    // Async due to CryptoKey imports; usages match what was set when keys were first generated
    // Throws if non-nullable keys are missing (non-extractable at export) — caller skips record
    return {
        ...r,
        smtp: {...r.smtp, pass: import_buf_nullable(r.smtp.pass)},
        host_state: {
            ...r.host_state,
            secret: await import_sym_key(r.host_state.secret),
            secret_old: null,
            shared_secret: await import_sym_key(r.host_state.shared_secret),
            resp_key: await import_key_pair(r.host_state.resp_key),
            resp_key_old: null,
        },
    }
}

function import_draft(r:ExportedDraft):RecordDraft{
    // Restore modified date
    return {...r, modified: new Date(r.modified)}
}

async function import_message(r:ExportedMessage):Promise<RecordMessage>{
    // Async due to assets_key import; also restores published date and embedded draft
    return {
        ...r,
        published: new Date(r.published),
        assets_key: await import_sym_key(r.assets_key),
        draft: import_draft(r.draft) as RecordDraftPublished,
    }
}

async function import_copy(r:ExportedMessageCopy):Promise<RecordMessageCopy>{
    // Async due to CryptoKey imports for both per-copy secrets
    return {
        ...r,
        secret: await import_sym_key(r.secret),
        secret_sse: await import_sym_key(r.secret_sse),
    }
}

function import_generic_with_sent<T extends {sent:string}>(r:T):Omit<T, 'sent'> & {sent:Date}{
    // Import a record that has standard JSON-compatible values except for "sent" date prop
    // This is the case for several response-related records
    return {...r, sent: new Date(r.sent)}
}


// MAIN


export async function export_database():Promise<ArrayBuffer>{
    // Export entire IndexedDB to a JSON-encoded ArrayBuffer for backup and later restoration
    // Blobs are assumed to already be blobstore filename strings after migration
    // CryptoKeys are exported as base64; non-extractable old keys become null
    // NOTE oauths are not backed up given they have credentials and user can just sign in again
    // NOTE No records in 'state' are backedup since would overwrite existing and none needed yet
    const db = self.app_db._conn
    const tables = {
        contacts: (await db.getAll('contacts')).map(export_contact),
        groups: await db.getAll('groups'),
        profiles: await Promise.all((await db.getAll('profiles')).map(export_profile)),
        subscribe_forms: await db.getAll('subscribe_forms'),
        drafts: (await db.getAll('drafts')).map(export_draft),
        sections: await db.getAll('sections'),
        messages: await Promise.all((await db.getAll('messages')).map(export_message)),
        copies: await Promise.all((await db.getAll('copies')).map(export_copy)),
        reads: (await db.getAll('reads')).map(export_generic_with_sent),
        replies: (await db.getAll('replies')).map(export_generic_with_sent),
        reactions: (await db.getAll('reactions')).map(export_generic_with_sent),
        unsubscribes: (await db.getAll('unsubscribes')).map(export_generic_with_sent),
        request_address: (await db.getAll('request_address')).map(export_generic_with_sent),
        request_resend: (await db.getAll('request_resend')).map(export_generic_with_sent),
        request_subscribe: (await db.getAll('request_subscribe')).map(export_generic_with_sent),
    }
    const exported:ExportedDatabase = {
        version: 1,
        dbid: (await db.get('state', 'dbid'))!.value as string,
        tables,
    }

    // If any blobs haven't been converted to blobstore yet, simply save them as 'blob'
    //    so size not huge and app will fallback on placeholders in worst case scenario
    const replacer = (_key:string, val:unknown) => val instanceof Blob ? 'blob' : val
    return string_to_utf8(JSON.stringify(exported, replacer, 2))
}


export async function import_database(buffer:ArrayBuffer):Promise<{added:number, skipped:number}>{
    // Restore records from a JSON backup, skipping any that already exist in the DB
    // This is additive-only — existing records are never overwritten

    const converters:Record<string, (r:unknown) => unknown> = {
        contacts: r => import_contact(r as ExportedContact),
        groups: r => r,
        profiles: r => import_profile(r as ExportedProfile),
        subscribe_forms: r => r,
        drafts: r => import_draft(r as ExportedDraft),
        sections: r => r,
        messages: r => import_message(r as ExportedMessage),
        copies: r => import_copy(r as ExportedMessageCopy),
        reads: r => import_generic_with_sent(r as {sent:string}),
        replies: r => import_generic_with_sent(r as {sent:string}),
        reactions: r => import_generic_with_sent(r as {sent:string}),
        unsubscribes: r => import_generic_with_sent(r as {sent:string}),
        request_address: r => import_generic_with_sent(r as {sent:string}),
        request_resend: r => import_generic_with_sent(r as {sent:string}),
        request_subscribe: r => import_generic_with_sent(r as {sent:string}),
    }

    const {tables} = JSON.parse(utf8_to_string(buffer)) as ExportedDatabase
    const db = self.app_db._conn
    let added = 0
    let skipped = 0
    for (const [store, import_fn] of Object.entries(converters)){
        for (const raw of tables[store] ?? []){
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await db.add(store as any, await import_fn(raw))
                added += 1
            } catch {
                skipped += 1  // Already exists, or import issue
            }
        }
    }

    return {added, skipped}
}

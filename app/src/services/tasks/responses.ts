
import {Task} from './tasks'
import {Profile} from '../database/profiles'
import {concurrent} from '../utils/async'
import {url64_to_buffer, utf8_to_string} from '../utils/coding'
import {decrypt_asym, decrypt_sym, generate_token} from '../utils/crypt'
import {email_address_like} from '../utils/misc'
import {HostUser} from '../hosts/types'


const RESP_TYPES_ASYNC = ['read', 'reply']  // Least priority -> greatest
const RESP_TYPES_SYNC = ['subscription', 'address', 'resend', 'reaction']  // Require order


export async function responses_receive(task:Task):Promise<void>{
    /* SECURITY Recieving responses has to protect against malicious readers and also responder fn
        While responder fn should generally be trustworthy, it is still worth minimizing any risk
    */

    // Configure task
    task.label = "Downloading responses"

    // Don't want to interrupt processing as a single error could block all response receiving
    // And errors may often be isolated to a single response or single profile
    // So use this var to store any error for throwing at the end (overwritten by future errors)
    let deferred_throw:unknown

    // Get all active profiles
    const profiles = (await self.app_db.profiles.list()).filter(profile => profile.setup_complete)

    // Form list of processing functions for all responses in all profiles
    const resp_fns_sync:(()=>Promise<void>)[] = []
    const resp_fns_async:{type:string, fn:()=>Promise<void>}[] = []
    for (const profile of profiles){
        const storage = await self.app_db.new_host_user(profile)
        try {
            // Get object keys for all responses for profile
            // NOTE Returns keys in order of last modified (important for sync processing)
            for (const key of await storage.list_responses()){

                // Extract response type from key
                const type = key.split('/')[2] ?? ''

                // Create fn for downloading and processing the response
                const fn = async () => {
                    try {
                        await task.expected(download_response(profile, storage, key, type))
                    } catch (error){
                        // Don't throw so don't prevent processing of the rest of responses
                        deferred_throw = error
                    }
                }

                // Place the fn in the approriate list
                if (RESP_TYPES_SYNC.includes(type)){
                    resp_fns_sync.push(fn)
                } else if (RESP_TYPES_ASYNC.includes(type)){
                    resp_fns_async.push({type, fn})
                } else {
                    // Should never have an unknown type unless responder higher version than app
                    // User can't do anything about this issue, so silently report
                    // NOTE Not deleting response as may be able to process when updated
                    self.app_report_error(new Error(`Invalid response type: ${type}`))
                }
            }
        } catch (error){
            // Other profiles may still work fine so reraise this later instead of interrupting
            deferred_throw = error
        }
    }

    // Sort async responses by type, prioritising them by importance
    resp_fns_async.sort((a, b) => {
        // RESP_TYPES_ASYNC is ordered from least to greatest, which works well for the -1 no match
        // But want to sort from greatest to least, hence b - a (negative puts a first)
        return RESP_TYPES_ASYNC.indexOf(b.type) - RESP_TYPES_ASYNC.indexOf(a.type)
    })

    // Update task counter with number of responses
    task.upcoming(resp_fns_async.length + resp_fns_sync.length)

    // Concurrently process async responses
    await concurrent(resp_fns_async.map(item => item.fn))

    // Synchronous tasks must be done in order as can override each other
    await Promise.all(resp_fns_sync.map(fn => fn()))

    // If error occured at any point, can throw it now that processing done
    if (deferred_throw){
        throw deferred_throw
    }
}


async function download_response(profile:Profile, storage:HostUser, object_key:string, type:string)
        :Promise<void>{
    // Download a response and process it
    // NOTE Can generally allow throws, except sometimes may want to delete object if safe to do so

    // Access profile's keys
    const sym_secret = profile.host_state.secret
    const asym_secret = profile.host_state.resp_key.privateKey!

    // Download and decrypt the data
    const resp = await storage.download_response(object_key)
    let binary_data:ArrayBuffer
    try {
        binary_data = await decrypt_asym(utf8_to_string(resp), asym_secret)
    } catch {
        // Likely failed due to _responder_ having an old key of a profile
        // Since unlikely ever able to recover, delete response and throw
        void storage.delete_response(object_key)
        throw new Error("Could not decrypt response")
    }
    const data = JSON.parse(utf8_to_string(binary_data))

    // Decrypt and unpack encrypted fields
    let encrypted_field:ArrayBuffer
    try {
        encrypted_field = await decrypt_asym(data.event.encrypted, asym_secret)
    } catch {
        // Likely failed due to _displayer_ having an old key of a profile
        // Since unlikely ever able to recover, delete response and throw
        void storage.delete_response(object_key)
        throw new Error("Could not decrypt response's encrypted field")
    }
    const encrypted_data = JSON.parse(utf8_to_string(encrypted_field))

    // SECURITY Ensure attacker can't send different data unencrypted/encrypted
    for (const prop of Object.keys(encrypted_data)){
        if (prop in data.event){
            throw new Error("Encrypted prop overwrites existing")
        }
        data.event[prop] = encrypted_data[prop]
    }

    // Decrypt symmetrically encrypted data, if any
    // SECURITY Do NOT merge into top level of object, as then can't distinguish which were plain
    //      Unlike asym encryption, sym encryption MUST gaurantee data is authenticated
    //      Asym data comes from the browser, but sym data comes from the user/application
    //      e.g. {a:'unauthed'} & {sym_encrypted:{a:'authed'}} would both result in {a:'...'}
    if (data.event.sym_encrypted){
        data.event.sym_encrypted = JSON.parse(utf8_to_string(
            await decrypt_sym(url64_to_buffer(data.event.sym_encrypted), sym_secret)))
    }

    // Get sent date from object key
    const timestamp_seconds = Number(object_key.split('/').at(-1)!.split('_')[0])
    const sent = new Date(timestamp_seconds * 1000)

    // Process
    await process_data(profile, type, data, sent)

    // Delete response object from bucket if processed successfully
    await storage.delete_response(object_key)
}


async function process_data(profile:Profile, type:string, data:any, sent:Date):Promise<void>{
    // Process and save data to db
    // SECURITY data contains untrusted user input and some responder function input
    // WARN Must await all tasks so that failure prevents response deletion from bucket

    // Force type of common fields
    const ip = data.ip ? String(data.ip) : null
    const resp_token = String(data.event.resp_token)
    const user_agent = String(data.event.user_agent)

    if (type === 'reaction' || type === 'reply'){
        const method = type === 'reply' ? 'reply_create' : 'reaction_create'
        await self.app_db[method](
            data.event.content ? String(data.event.content) : null,
            sent,
            resp_token,
            data.event.section_id ? String(data.event.section_id) : null,
            // NOTE `event.subsection_id` did not exist in v0.4.1 and less
            data.event.subsection_id ? String(data.event.subsection_id) : null,
            ip,
            user_agent,
        )

    } else if (type === 'read'){
        await self.app_db.read_create(sent, resp_token, ip, user_agent)

    } else if (type === 'subscription'){
        // NOTE Possible that no address available (if didn't use invite's URL) and copy deleted
        //      But so unlikely (as a timing issue) it is not worth worrying about

        // Determine if adding or removing an unsubscribe record
        let apply:(c:string)=>Promise<void> = c => self.app_db.unsubscribes.set(
            {profile: profile.id, contact: c, sent, ip, user_agent})
        if (data.event.subscribed){
            apply = c => self.app_db.unsubscribes.remove(profile.id, c)
        }

        // Create unsubscribed records for all contacts that match address (if given)
        // SECURITY Don't need resp_token since address' encryption provides authenticity
        const address = String(data.event.sym_encrypted?.address.trim() ?? '')
        if (address){
            for (const contact of await self.app_db.contacts.list_for_address(address)){
                if (!contact.multiple){  // Multi-person contacts can't alter subscription
                    await apply(contact.id)
                }
            }
        }

        // If copy still exists, also create record for its contact (harmless if already done)
        const copy = await self.app_db.copies.get_by_resp_token(resp_token)
        if (copy){
            const contact = await self.app_db.contacts.get(copy.contact_id)
            if (contact && !contact.multiple){  // Multi-person contacts can't alter subscription
                await apply(contact.id)
            }
        }

    } else if (type === 'address'){
        // NOTE Possible that no encrypted address available (if didn't use invite's URL)
        //      But so unlikely (as a timing issue) it is not worth worrying about

        // Do basic validation of new address
        // SECURITY In the end, only the user can verify if looks legit
        const new_address = String(data.event.new_address)
        if (!email_address_like(new_address)){
            console.warn("Invalid email address: " + new_address)
            return  // Do nothing and allow response to be deleted
        }

        // Helper for creating request records
        const create_record = async (contact:string, old_address:string) => {
            if (old_address !== new_address){
                await self.app_db._conn.put('request_address',
                    {sent, ip, user_agent, contact, old_address, new_address})
            }
        }

        // Create change address records for all contacts that match address (if given)
        // SECURITY Don't need resp_token since address' encryption provides authenticity
        const old = String(data.event.sym_encrypted?.address.trim() ?? '')
        if (old){
            for (const contact of await self.app_db.contacts.list_for_address(old)){
                if (!contact.multiple){  // Multi-person contacts can't alter address
                    await create_record(contact.id, contact.address)
                }
            }
        }

        // If copy still exists, also create record for its contact (harmless if already done)
        const copy = await self.app_db.copies.get_by_resp_token(resp_token)
        if (copy){
            const contact = await self.app_db.contacts.get(copy.contact_id)
            if (contact && !contact.multiple){  // Multi-person contacts can't alter subscription
                await create_record(copy.contact_id, copy.contact_address)
            }
        }

    } else if (type === 'resend'){

        // Validate user input
        const reason = String(data.event.content)

        // Get copy by resp_token
        const copy = await self.app_db.copies.get_by_resp_token(resp_token)

        // If copy still exists good, otherwise generate fake id so db can still index record
        // NOTE Same secenario if user deletes the message/contact after saving this record anyway
        let contact:string
        let message:string
        if (copy){
            contact = copy.contact_id
            message = copy.msg_id
        } else {
            const fake_id = generate_token()
            contact = fake_id
            message = fake_id
        }

        // Create request record
        await self.app_db._conn.put('request_resend',
            {sent, ip, user_agent, contact, message, reason})

    } else {
        throw new Error("Invalid type")
    }
}


import {Task} from './tasks'
import {Profile} from '../database/profiles'
import {concurrent} from '../utils/async'
import {utf8_to_string} from '../utils/coding'
import {decrypt_asym} from '../utils/crypt'
import {get_last, remove_matches} from '../utils/arrays'
import {HostUser} from '../hosts/types'
import type {ResponseEvent} from '../../shared/shared_types'


const BY_PRIORITY = ['error', 'read', 'reaction', 'reply'] as const  // least to greatest
type ResponseType = typeof BY_PRIORITY[number]


export async function responses_receive(task:Task):Promise<void>{
    /* SECURITY Recieving responses has to protect against malicious readers and also responder fn
        While responder fn should generally be trustworthy, it is still worth minimizing any risk
    */

    // Configure task
    task.label = "Downloading responses"

    // Don't want to interrupt processing as a single error could block all response receiving
    // And errors may often be isolated to a single response or single profile
    // So use this var to store any error for throwing at the end (overwritten by future errors)
    let deferred_throw:any

    // Get all active profiles
    const profiles = (await self._db.profiles.list()).filter(profile => profile.setup_complete)

    // Preserve instances of storage for each profile
    const storages:{[id:string]:HostUser} = {}

    // Form list of [profile, type, key] tuples for all responses in all profiles
    const responses:[Profile, ResponseType, string][] = []
    for (const profile of profiles){
        storages[profile.id] = profile.new_host_user()
        try {
            const keys_for_profile = await storages[profile.id].list_responses()
            responses.push(...keys_for_profile.map(k => {
                const type = k.split('/')[1] as ResponseType
                return [profile, type, k] as [Profile, ResponseType, string]
            }))
        } catch (error){
            // Other profiles may still work fine so reraise this later instead of interrupting
            deferred_throw = error
        }
    }
    task.upcoming(responses.length)

    // Ignore and report any invalid types
    // NOTE Not deleting as might be able to fix later with a patch
    const invalid = remove_matches(responses, ([p, type, k]) => !BY_PRIORITY.includes(type))
    if (invalid.length){
        self._fail_report(`Invalid response type: ${invalid[0][1]}`)  // Just report first
    }

    // Sort responses by type, prioritising them by importance
    responses.sort((a, b) => {
        // BY_PRIORITY is ordered from least to greatest, which works well for the -1 no match
        // But want to sort from greatest to least, hence b - a (negative puts a first)
        return BY_PRIORITY.indexOf(b[1]) - BY_PRIORITY.indexOf(a[1])
    })

    // Concurrently process batches in order
    const jobs = concurrent(responses.map(([profile, type, key]) => {
        return async () => {

            // Download and decrypt the data
            const resp = await storages[profile.id].download_response(key)
            const private_key = profile.host_state.resp_key.privateKey
            let binary_data:ArrayBuffer
            try {
                binary_data = await decrypt_asym(utf8_to_string(resp), private_key)
            } catch {
                // Likely failed due to _responder_ having an old key of a profile
                // Since unlikely ever able to recover, delete response but do throw
                deferred_throw = new Error("Could not decrypt response")
                storages[profile.id].delete_response(key)
                return
            }
            const data = JSON.parse(utf8_to_string(binary_data))

            // Decrypt and unpack encrypted fields
            let encrypted_field:ArrayBuffer
            try {
                encrypted_field = await decrypt_asym(data.event.encrypted, private_key)
            } catch {
                // Likely failed due to _displayer_ having an old key of a profile
                // Since unlikely ever able to recover, delete response but do throw
                deferred_throw = new Error("Could not decrypt response's encrypted field")
                storages[profile.id].delete_response(key)
                return
            }
            const encrypted_data = JSON.parse(utf8_to_string(encrypted_field))
            // SECURITY Ensure attacker can't send different data unencrypted/encrypted
            for (const prop of Object.keys(encrypted_data)){
                if (prop in data.event){
                    throw new Error("Encrypted prop overwrites existing")  // TODO handle errors
                }
                data.event[prop] = encrypted_data[prop]
            }

            // Get sent date from object key
            const timestamp_seconds = Number(get_last(key.split('/')).split('_')[0])
            const sent = new Date(timestamp_seconds * 1000)

            // Process
            await task.expected(process_event(data.event, sent, data.ip))

            // Delete response object from bucket if processed successfully
            // WARN Ensure have awaited all tasks involved with processing event before delete
            storages[profile.id].delete_response(key)
        }
    }))

    // Complete task when all done
    await jobs
    if (deferred_throw){
        throw deferred_throw
    }
}



async function process_event(data:ResponseEvent, sent:Date, ip:string):Promise<void>{
    // Process and save event to db
    if (data.type === 'reaction'){
        // NOTE `data.subsection_id` did not exist in v0.4.1 and less
        await self._db.reaction_create(data.content, sent, data.resp_token, data.section_id,
            data.subsection_id ?? null, ip, data.user_agent)
    } else if (data.type === 'reply'){
        await self._db.reply_create(data.content, sent, data.resp_token, data.section_id,
            data.subsection_id ?? null, ip, data.user_agent)
    } else if (data.type === 'read'){
        await self._db.read_create(sent, data.resp_token, ip, data.user_agent)
    } else {
        throw new Error("Invalid type")
    }
}


import {Task} from './tasks'
import {Profile} from '../database/profiles'
import {concurrent} from '../utils/async'
import {utf8_to_string} from '../utils/coding'
import {decrypt_asym} from '../utils/crypt'
import {get_last} from '../utils/arrays'
import {HostUser} from '../hosts/types'
import type {ResponseEvent} from '../../shared/shared_types'


const BY_PRIORITY = ['error', 'read', 'reaction', 'reply']  // least to greatest


export async function responses_receive(task:Task):Promise<void>{

    // Configure task
    task.label = "Downloading responses"

    // Get all active profiles
    const profiles = (await self._db.profiles.list()).filter(profile => profile.setup_complete)

    // Preserve instances of storage for each profile
    const storages:{[id:string]:HostUser} = {}

    // Preserve any error in obtaining a profile's responses list for reraising later
    let list_responses_error:any

    // Form list of [profile, key] pairs for all responses in all profiles
    const responses:[Profile, string][] = []
    for (const profile of profiles){
        storages[profile.id] = profile.new_host_user()
        try {
            const keys_for_profile = await storages[profile.id].list_responses()
            responses.push(...keys_for_profile.map(
                (k:string):[Profile, string] => [profile, k],
            ))
        } catch (error){
            // Other profiles may still work fine so reraise this later instead of interrupting
            list_responses_error = error
        }
    }
    task.upcoming(responses.length)

    // Sort responses by type, prioritising them by importance
    responses.sort((a, b) => {
        // BY_PRIORITY is ordered from least to greatest, which works well for the -1 no match
        // But want to sort from greatest to least, hence b - a (negative puts a first)
        return BY_PRIORITY.indexOf(b[1].split('/')[1]) - BY_PRIORITY.indexOf(a[1].split('/')[1])
    })

    // Concurrently process batches in order
    const jobs = concurrent(responses.map(([profile, key]) => {
        return async () => {

            // Download and decrypt the data
            const resp = await storages[profile.id].download_response(key)
            const private_key = profile.host_state.resp_key.privateKey
            let binary_data:ArrayBuffer
            try {
                binary_data = await decrypt_asym(utf8_to_string(resp), private_key)
            } catch {
                // Failure to decrypt is likely due to changing keys (e.g. reusing an old storage)
                // TODO Determine if this would ever occur outside of development
                storages[profile.id].delete_response(key)
                return
            }
            const data = JSON.parse(utf8_to_string(binary_data))

            // Decrypt and unpack encrypted fields
            // TODO Account for failure to decrypt or parse etc
            const encrypted_field = await decrypt_asym(data.event.encrypted, private_key)
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
            const success = await task.expected(process_event(data.event, sent, data.ip))

            // Delete response object from bucket if processed successfully
            // WARN Ensure have awaited all tasks involved with processing event before delete
            if (success){
                storages[profile.id].delete_response(key)
            }
        }
    }))

    // Complete task when all done
    await jobs
    if (list_responses_error){
        throw list_responses_error
    }
}



async function process_event(data:ResponseEvent, sent:Date, ip:string):Promise<boolean>{
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
        return false  // TODO Can't process (handle better)
    }
    return true
}

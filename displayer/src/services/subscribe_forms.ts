
import {MSGS_URL, USER} from './env'
import {request} from './utils/http'
import {url64_to_buffer, utf8_to_string} from './utils/coding'
import {import_key_sym, decrypt_sym} from './utils/crypt'
import {SubscribeFormConfig} from '@/shared/shared_types'


export async function get_form_data(form_id:string):Promise<SubscribeFormConfig|null>{
    // Fetch encrypted form configs and see if one decrypts successfully

    try {
        // Convert the form id into a key
        const secret = await import_key_sym(url64_to_buffer(form_id))

        // Download forms config
        const forms = await request<string[]>(`${MSGS_URL}config/${USER}/subscribe`, {}, 'json')

        // See if one decrypts successfully
        for (const form of forms){
            try {
                const decrypted = await decrypt_sym(url64_to_buffer(form), secret)
                return JSON.parse(utf8_to_string(decrypted)) as SubscribeFormConfig
            } catch {
                // Try next
            }
        }
    } catch {
        // Return null if anything fails
    }

    return null
}

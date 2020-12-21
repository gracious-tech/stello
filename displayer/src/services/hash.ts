
import {url64_to_buffer} from './utils/coding'
import {validate_chars} from './utils/exceptions'
import {import_key_sym} from './utils/crypt'


export async function decode_hash(hash:string){
    // Decode given hash and either return null if none, or an object with the parts
    // NOTE hash always prefixed with '#' (unless empty in which case just '')

    // If no hash, return null
    if (!hash){
        return null
    }

    // Some mail clients (such as postbox-inc.com) incorrectly encode '~' when displaying HTML
    // Even if the actual email's HTML doesn't have it encoded, it is encoded when displayed/clicked
    // NOTE The current hash syntax is simple enough that repeated decodes are harmless
    hash = decodeURIComponent(hash)

    // Extract fields from the hash
    const [disp_config_name, msg_id, secret_url64, action] = hash.slice(1).split(',')
    if (!disp_config_name || !msg_id || !secret_url64){
        return null
    }

    /* SECURITY the hash is one avenue an attacker can insert malicious data
        An attacker could construct a hash value and get naive users to click it
        So important to validate values and restrict to expected chars at very least
        (as, for example, disp_config_name is directly inserted into URLs later)
    */
   // NOTE While technically disp_config_name and msg_id are also url64 encoded
   //      they are never used in bytes form, as their url64 form is their official form
    const url64_chars = 'a-zA-Z0-9\\_\\-\\~'
    try {
        validate_chars(disp_config_name, url64_chars)
        validate_chars(msg_id, url64_chars)
        validate_chars(secret_url64, url64_chars)
        if (action){
            validate_chars(action, 'a-z\\_')
        }
    } catch {
        return null
    }

    // Decode the secret and contain within a restrictive CryptoKey instance
    // NOTE Must allow extracting so can later generate response token
    const msg_secret = await import_key_sym(url64_to_buffer(secret_url64), true)

    // Return as object
    return {disp_config_name, msg_id, msg_secret, action: action || null}
}

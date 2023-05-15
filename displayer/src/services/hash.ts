
import {validate_chars} from './utils/exceptions'


interface HashData {
    config_secret_url64:string|null
    msg_id:string|null
    msg_secret_url64:string|null
    action:string|null
    action_arg:string|null
    subscribe:string|null
}


export async function decode_hash(hash:string):Promise<HashData|null>{
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
    const [config_secret, msg_id, msg_secret_url64, action, action_arg]
        = hash.slice(1).split(',')
    if (!config_secret){
        return null  // At minimum every hash has config secret (or subscribe form id)
    }

    /* SECURITY the hash is one avenue an attacker can insert malicious data
        An attacker could construct a hash value and get naive users to click it
        So important to validate values and restrict to expected chars at very least
    */
    const url64_chars = 'a-zA-Z0-9\\_\\-\\~'
    try {
        validate_chars(config_secret, url64_chars)
        if (msg_id && msg_secret_url64){
            validate_chars(msg_id, url64_chars)
            validate_chars(msg_secret_url64, url64_chars)
        }
        if (action){
            validate_chars(action, 'a-z\\_')
        }
        if (action_arg){
            validate_chars(action_arg, url64_chars)
        }
    } catch {
        return null
    }

    // If only one value then assume it's a subscribe form
    const subscribe = hash.includes(',') ? null : config_secret
    const config_secret_url64 = subscribe ? null : config_secret

    // Return as object
    return {
        config_secret_url64,  // Not parsed as will later send url64 form in responses
        msg_id: msg_id || null,
        msg_secret_url64: msg_secret_url64 || null,
        action: action || null,
        action_arg: action_arg || null,
        subscribe,
    }
}

// Access to encryption that uses secret external to app
// TODO If significant number of users have no os_crypt access
// TODO     then prompt for CUSTOM_SECRET at startup so that it remains same after closing Stello

import {string_to_utf8, utf8_to_string} from '@/services/utils/coding'
import {decrypt_sym, encrypt_sym, generate_key_sym} from '@/services/utils/crypt'


let CUSTOM_SECRET:CryptoKey|null = null


export async function external_encrypt(secret:string):Promise<ArrayBuffer>{
    // External encryption that is guaranteed to always be available

    // If custom secret not set then try OS encryption as first preference
    if (!CUSTOM_SECRET){
        const encrypted = await self.app_native.os_encrypt(secret)
        if (encrypted !== null){
            return encrypted
        }
        // OS encryption unavailable so create a tmp secret that will use for rest of session
        // NOTE Secrets will fail to decrypt upon next app use, but should be a rare situation
        CUSTOM_SECRET = await generate_key_sym(false, ['encrypt', 'decrypt'])
    }

    // OS encryption unavailable so use own
    return encrypt_sym(string_to_utf8(secret), CUSTOM_SECRET)
}


export async function external_decrypt(encrypted:ArrayBuffer):Promise<string>{
    // External decryption that is guaranteed to always be available
    // NOTE Empty string returned when can't decrypt due to changing key
    //      Designed to result in auth failure and let usual re-auth system handle recovery
    try {
        if (CUSTOM_SECRET){
            return utf8_to_string(await decrypt_sym(encrypted, CUSTOM_SECRET))
        }
        return (await self.app_native.os_decrypt(encrypted)) ?? ''
    } catch (error){
        self.app_report_error(error)
        return ''
    }
}

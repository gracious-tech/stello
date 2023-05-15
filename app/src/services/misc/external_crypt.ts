// Access to encryption that uses secret external to app

import {string_to_utf8, utf8_to_string} from '@/services/utils/coding'
import {decrypt_sym, encrypt_sym, generate_key_sym} from '@/services/utils/crypt'
import {MustReauthenticate} from '@/services/utils/exceptions'


export async function external_encrypt(secret:string):Promise<ArrayBuffer>{
    // External encryption that is guaranteed to always be available

    // If custom secret not set then try OS encryption as first preference
    if (!self.app_store.state.fallback_secret){
        const encrypted = await self.app_native.os_encrypt(secret)
        if (encrypted !== null){
            return encrypted
        }
        // OS encryption unavailable so create a secret preserved within own db
        // NOTE Any previous secrets will fail to decrypt and need re-entering
        self.app_store.commit('dict_set', ['fallback_secret',
            await generate_key_sym(false, ['encrypt', 'decrypt'])])
        self.app_report_error(new Error("OS encryption unavailable (falling back on own)"))
    }

    // OS encryption unavailable so use own
    return encrypt_sym(string_to_utf8(secret), self.app_store.state.fallback_secret!)
}


export async function external_decrypt(encrypted:ArrayBuffer):Promise<string>{
    // External decryption that is guaranteed to always be available
    // NOTE Empty string returned when can't decrypt due to changing key
    //      Designed to result in auth failure and let usual re-auth system handle recovery
    try {
        if (self.app_store.state.fallback_secret){
            return utf8_to_string(await decrypt_sym(encrypted,
                self.app_store.state.fallback_secret))
        }
        const decrypted = await self.app_native.os_decrypt(encrypted)
        if (decrypted){
            return decrypted
        }
    } catch {
        // Will throw later
    }

    // Couldn't decrypt so must get new credentials
    // NOTE This should only happen once for each secret when falling back to own encryption
    throw new MustReauthenticate()
}

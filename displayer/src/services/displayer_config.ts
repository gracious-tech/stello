
import {url64_to_buffer, utf8_to_string} from './utils/coding'
import {import_key_asym, import_key_sym, decrypt_sym} from './utils/crypt'
import {request} from './utils/http'


export const MSGS_URL =
    import.meta.env.DEV ? '/dev/' : (import.meta.env.VITE_HOSTED_MSGS_URL ?? '/')
export const USER =
    import.meta.env.VITE_HOSTED_MSGS_URL ? self.location.hostname.split('.')[0]! : '_user'


class DisplayerConfigAccess {
    // Displayer config represented by a class for synchronous access with defaults

    // If config not available, all responses disabled
    version = 'unknown'
    responder:string|false|null = null  // false if config deleted (account disabled)
    notify_include_contents = false
    allow_replies = false
    allow_reactions = false
    allow_delete = false
    allow_resend_requests = false
    social_referral_ban = true
    resp_key_public:CryptoKey|null = null
    // NOTE `reaction_options` didn't exist till after v0.4.1, so default needed for old configs
    reaction_options:string[] = ['like', 'love', 'yay', 'pray', 'laugh', 'wow', 'sad']

    async _load(config_secret_url64:string):Promise<void>{
        // Download and apply config

        // Download config
        let encrypted:ArrayBuffer|null
        try {
            encrypted = await request(`${MSGS_URL}config/${USER}/config`, {}, 'arrayBuffer',
                'throw_null403-4')
            if (!encrypted){
                // Config no longer exists, the sign account deactivated, so disable responses
                this.responder = false
                this.allow_replies = false
                this.allow_reactions = false
                this.allow_delete = false
                this.allow_resend_requests = false
                return
            }
        } catch {
            return  // Likely just network failure so ignore
        }

        // Decrypt config
        let config:Record<string, unknown>
        try {
            const config_secret = await import_key_sym(url64_to_buffer(config_secret_url64))
            config = JSON.parse(utf8_to_string(
                await decrypt_sym(encrypted, config_secret))) as Record<string, unknown>
        } catch {
            return // Almost certainly a bad url, so no report as probably user error
        }

        // Apply config
        Object.assign(this, {
            ...config,
            // Convert base64 public key into a CryptoKey
            resp_key_public: await import_key_asym(url64_to_buffer(
                config['resp_key_public'] as string)),
        })

        // If using gracious hosting, responder url forced as not dynamic like self-hosted is
        if (import.meta.env.VITE_HOSTED_API){
            this.responder = import.meta.env.VITE_HOSTED_API + 'responder/'
        }

        // Uncomment during dev to send requests to locally served responder
        // this.responder = 'http://127.0.0.1:8004/responder/'
    }

    async safe_load(config_secret_url64:string):Promise<boolean>{
        // Since can display message fine without displayer config, only report failure, don't show
        try {
            await this._load(config_secret_url64)
        } catch (error){
            self.app_report_error(error)
            return false
        }
        return true
    }
}


// Export instance of config class so can import and use synchronously
export const displayer_config = new DisplayerConfigAccess()

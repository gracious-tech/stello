
import {request} from './utils/http'
import {partition} from './utils/strings'
import {url64_to_buffer, utf8_to_string} from './utils/coding'
import {import_key_asym, import_key_sym, decrypt_sym} from './utils/crypt'
import {ThemeStyle} from '@/shared/shared_types'


export const MSGS_URL =
    import.meta.env.DEV ? '/dev/' : (import.meta.env.VITE_HOSTED_MSGS_URL ?? '/')
export const USER =
    import.meta.env.VITE_HOSTED_MSGS_URL ? self.location.hostname.split('.')[0]! : '_user'


class DisplayerConfigAccess {
    // Displayer config represented by a class for synchronous access with defaults

    error:'network'|'decrypt'|'inactive'|null = null

    // If config not available, all responses disabled
    version = 'unknown'
    responder:string|false|null = null  // false if config deleted (account disabled)
    notify_include_contents = false
    allow_replies = false
    allow_comments = false
    allow_reactions = false
    allow_delete = false
    allow_resend_requests = false
    social_referral_ban = true
    resp_key_public:CryptoKey|null = null
    // NOTE `reaction_options` didn't exist till after v0.4.1, so default needed for old configs
    reaction_options:string[] = ['like', 'love', 'yay', 'pray', 'laugh', 'wow', 'sad']
    theme_style:ThemeStyle = 'modern'  // NOTE Didn't exist until after v1.0.11
    theme_color = {h: 210, s: 0.75, l: 0.75}  // NOTE Didn't exist until after v1.0.11

    async _load(config_secret_url64:string):Promise<boolean>{
        // Download and apply config
        this.error = null

        // Download config
        let encrypted:ArrayBuffer|null
        try {
            encrypted = await request(`${MSGS_URL}config/${USER}/config`, {}, 'arrayBuffer',
                'throw_null403-4')
            if (!encrypted){
                // Config no longer exists, the sign account deactivated, so disable responses
                this.responder = false
                this.allow_replies = false
                this.allow_comments = false
                this.allow_reactions = false
                this.allow_delete = false
                this.allow_resend_requests = false

                this.error = 'inactive'
                return false
            }
        } catch {
            this.error = 'network'
            return false
        }

        // Decrypt config
        let config:Record<string, unknown>
        try {
            const config_secret = await import_key_sym(url64_to_buffer(config_secret_url64))
            config = JSON.parse(utf8_to_string(
                await decrypt_sym(encrypted, config_secret))) as Record<string, unknown>
        } catch {
            this.error = 'decrypt'
            return false  // Almost certainly a bad url, so no report as probably user error
        }

        // Apply config
        Object.assign(this, {
            ...config,
            // Convert base64 public key into a CryptoKey
            resp_key_public: await import_key_asym(url64_to_buffer(
                config['resp_key_public'] as string)),
        })

        // allow_comments added after v1.1.0 and previously defaulted to value of allow_replies
        if (! ('allow_comments' in config)){
            this.allow_comments = this.allow_replies
        }

        // If using gracious hosting, responder url forced as not dynamic like self-hosted is
        if (import.meta.env.VITE_HOSTED_MSGS_URL){
            const parent_domain = partition(self.location.hostname, '.')[1]
            this.responder = `https://api.${parent_domain}/responder/`
        }

        // Uncomment during dev to send requests to locally served responder
        // this.responder = 'http://127.0.0.1:8004/responder/'

        return true
    }

    async safe_load(config_secret_url64:string):Promise<boolean>{
        // Since can display message fine without displayer config, only report failure, don't show
        try {
            return await this._load(config_secret_url64)
        } catch (error){
            self.app_report_error(error)
            return false
        }
    }
}


// Export instance of config class so can import and use synchronously
export const displayer_config = new DisplayerConfigAccess()

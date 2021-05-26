
import {url64_to_buffer} from './utils/coding'
import {import_key_asym} from './utils/crypt'
import {request_json} from './utils/http'
import {error_to_string} from './utils/exceptions'
import {deployment_config} from './deployment_config'


async function download_displayer_config(name:string):Promise<any>{
    // Download and parse displayer config
    const url = `${deployment_config.url_msgs}disp_config_${name}`
    const config = await request_json(url, undefined, true).catch(error => {
        self._fail_report(error_to_string(error))
        return null  // Don't cause UI to fail
    })

    // Convert base64 public key into a CryptoKey
    if (config?.resp_key_public){
        config.resp_key_public = await import_key_asym(url64_to_buffer(config.resp_key_public))
    }

    return config
}


class DisplayerConfig {
    // Displayer config represented by a class for synchronous access with defaults

    // In the unexpected event of not being able to download config, default to featureless+secure
    notify_include_contents:boolean = false
    allow_replies:boolean = false
    allow_reactions:boolean = false
    allow_delete:boolean = false
    allow_resend_requests:boolean = false
    social_referral_ban:boolean = true
    credentials_responder:{key_id:string,key_secret:string}|null = null
    resp_key_public:CryptoKey|null = null
    // NOTE `reaction_options` didn't exist till after v0.4.1, so default needed for old configs
    reaction_options:string[] = ['like', 'love', 'yay', 'pray', 'laugh', 'wow', 'sad']

    async load(name_in_hash?:string, prev_name?:string|null):Promise<string|null>{
        // Download and apply config
        let worked = null
        let config = null

        // First try hash if given
        if (name_in_hash){
            config = await download_displayer_config(name_in_hash)
            if (config){
                worked = name_in_hash
            }
        }

        // Try prev if given and hash didn't work
        if (!worked && prev_name){
            config = await download_displayer_config(prev_name)
            if (config){
                worked = prev_name
            }
        }

        // Apply config if worked
        if (config){
            Object.assign(this, config)
        }

        // Report which one worked
        return worked
    }

}


// Export instance of config class so can import and use synchronously
export const displayer_config = new DisplayerConfig()

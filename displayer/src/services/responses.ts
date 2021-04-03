
import {AwsClient} from 'aws4fetch'

import {deployment_config} from './deployment_config'
import {displayer_config} from './displayer_config'
import {string_to_utf8} from './utils/coding'
import {encrypt_asym} from './utils/crypt'


async function respond(data:any):Promise<boolean>{
    // Send a response and return success boolean
    // SECURITY Only success boolean is returned, for error info rely on lambda's own reporting

    // Can't respond without credentials (may be missing if issue with displayer config)
    if (!displayer_config.credentials_responder){
        return false
    }

    // Add user agent to encrypted object
    // SECURITY This can always be spoofed so no advantage to doing serverside over clientside
    data.encrypted.user_agent = self.navigator.userAgent

    // Encrypt data's encrypted field
    const binary_data = string_to_utf8(JSON.stringify(data.encrypted))
    data.encrypted = await encrypt_asym(binary_data, displayer_config.resp_key_public)

    // Init AWS client
    const aws = new AwsClient({
        accessKeyId: displayer_config.credentials_responder.key_id,
        secretAccessKey: displayer_config.credentials_responder.key_secret,
        retries: 3,  // default is 10
    })

    // Submit data
    try {
        const resp = await aws.fetch(deployment_config.url_responder, {
            body: JSON.stringify(data),
            /* TODO Can't test properly yet since sam local server doesn't support CORS yet
                    HOWEVER, real lambda does, so affects dev only, not production
                    See https://github.com/aws/aws-sam-cli/pull/2082
            */
            mode: import.meta.env.MODE === 'development' ? 'no-cors' : 'cors',
        })
        return (await resp.json()).success
    } catch (error){
        console.log(error)
        return false
    }
}


export function respond_read(resp_token:string, copy_id:string, has_max_reads:boolean):Promise<boolean>{
    // Send read response
    return respond({
        type: 'read',
        copy_id,  // Responder needs
        has_max_reads,  // Responder needs
        encrypted: {
            resp_token,
        },
    })
}


export function respond_reply(resp_token:string, text:string, section_id:string):Promise<boolean>{
    // Send text response
    const data:any = {
        type: 'reply',
        encrypted: {
            resp_token,
            section_id,
        },
    }

    // Store content inside/outside encryption depending on notify setting
    const container = displayer_config.notify_include_contents ? data : data.encrypted
    container.content = text

    return respond(data)
}


export function respond_reaction(resp_token:string, reaction:string, section_id:string,
        ):Promise<boolean>{
    // Send reaction response
    const data:any = {
        type: 'reaction',
        encrypted: {
            resp_token,
            section_id,
        },
    }

    // Store content inside/outside encryption depending on notify setting
    const container = displayer_config.notify_include_contents ? data : data.encrypted
    container.content = reaction

    return respond(data)
}

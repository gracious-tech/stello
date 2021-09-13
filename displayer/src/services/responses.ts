
import {deployment_config} from './deployment_config'
import {displayer_config} from './displayer_config'
import {string_to_utf8} from './utils/coding'
import {encrypt_asym} from './utils/crypt'
import {report_http_failure, request} from './utils/http'


async function respond(data):Promise<boolean>{
    // Send a response and return success boolean
    // SECURITY Only success boolean is returned, for error info rely on lambda's own reporting

    // Add user agent to encrypted object
    // SECURITY This can always be spoofed so no advantage to doing serverside over clientside
    data.encrypted.user_agent = self.navigator.userAgent

    // Encrypt data's encrypted field
    const binary_data = string_to_utf8(JSON.stringify(data.encrypted))
    data.encrypted = await encrypt_asym(binary_data, displayer_config.resp_key_public!)

    // Submit data
    try {
        await request(deployment_config.url_responder, {
            mode: 'cors',
            method: 'POST',
            json: data,
        }, undefined, 'throw')
    } catch (error){
        report_http_failure(error)
        return false
    }
    return true
}


export function respond_read(resp_token:string, copy_id:string,
        has_max_reads:boolean):Promise<boolean>{
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


export function respond_reply(resp_token:string, text:string, section_id:string|null,
        subsection_id:string|null):Promise<boolean>{
    // Send text response
    const data = {
        type: 'reply',
        encrypted: {
            resp_token,
            section_id,
            subsection_id,
        },
    }

    // Store content inside/outside encryption depending on notify setting
    const container = displayer_config.notify_include_contents ? data : data.encrypted
    container.content = text

    return respond(data)
}


export function respond_reaction(resp_token:string, reaction:string|null, section_id:string,
        subsection_id:string|null):Promise<boolean>{
    // Send reaction response
    const data = {
        type: 'reaction',
        encrypted: {
            resp_token,
            section_id,
            subsection_id,
        },
    }

    // Store content inside/outside encryption depending on notify setting
    const container = displayer_config.notify_include_contents ? data : data.encrypted
    container.content = reaction

    return respond(data)
}


export function respond_subscription(resp_token:string, subscribed:boolean,
        encrypted_address:string|null):Promise<boolean>{
    // Send subscription response
    return respond({
        type: 'subscription',
        encrypted: {
            resp_token,
            subscribed,
            sym_encrypted: encrypted_address,
        },
    })
}


export function respond_address(resp_token:string, new_address:string,
        encrypted_address:string|null):Promise<boolean>{
    // Send change address response
    return respond({
        type: 'address',
        encrypted: {
            resp_token,
            new_address,
            sym_encrypted: encrypted_address,
        },
    })
}


export function respond_resend(resp_token:string, reason:string):Promise<boolean>{
    // Send "resend" response
    const data = {
        type: 'resend',
        encrypted: {
            resp_token,
        },
    }

    // Store content inside/outside encryption depending on notify setting
    const container = displayer_config.notify_include_contents ? data : data.encrypted
    container.content = reason

    return respond(data)
}

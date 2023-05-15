
import {store} from '@/services/store'
import {displayer_config} from './displayer_config'
import {string_to_utf8} from './utils/coding'
import {encrypt_asym} from './utils/crypt'
import {report_http_failure, request} from './utils/http'


type PartialResponseData = {encrypted: Record<string, unknown>, [k:string]:unknown}


async function respond(type:string, data:PartialResponseData):Promise<boolean>{
    // Send a response and return success boolean
    // SECURITY Only success boolean is returned, for error info rely on lambda's own reporting

    // Respond functions should never get called if config not loaded
    if (!displayer_config.responder){
        throw new Error("Config not loaded")
    }

    // Attach config secret so responder can decrypt user's responder config
    data['config_secret'] = store.state.dict.config_secret

    // Add user agent to encrypted object
    // SECURITY This can always be spoofed so no advantage to doing serverside over clientside
    data.encrypted['user_agent'] = self.navigator.userAgent

    // Encrypt data's encrypted field
    const retyped_data = data as Record<string, unknown>
    const encrypted_utf8 = string_to_utf8(JSON.stringify(data.encrypted))
    retyped_data['encrypted'] =
        await encrypt_asym(encrypted_utf8, displayer_config.resp_key_public!)

    // Submit data
    try {
        await request(`${displayer_config.responder}${type}`, {
            mode: 'cors',
            method: 'POST',
            json: retyped_data,
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
    return respond('read', {
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
    const data:PartialResponseData = {
        encrypted: {
            resp_token,
            section_id,
            subsection_id,
        },
    }

    // Store content inside/outside encryption depending on notify setting
    const container = displayer_config.notify_include_contents ? data : data.encrypted
    container['content'] = text

    return respond('reply', data)
}


export function respond_reaction(resp_token:string, reaction:string|null, section_id:string,
        subsection_id:string|null):Promise<boolean>{
    // Send reaction response
    const data:PartialResponseData = {
        encrypted: {
            resp_token,
            section_id,
            subsection_id,
        },
    }

    // Store content inside/outside encryption depending on notify setting
    const container = displayer_config.notify_include_contents ? data : data.encrypted
    container['content'] = reaction

    return respond('reaction', data)
}


export function respond_subscription(resp_token:string, subscribed:boolean,
        encrypted_address:string|null):Promise<boolean>{
    // Send subscription response
    return respond('subscription', {
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
    return respond('address', {
        encrypted: {
            resp_token,
            new_address,
            sym_encrypted: encrypted_address,
        },
    })
}


export function respond_resend(resp_token:string, reason:string):Promise<boolean>{
    // Send "resend" response
    const data:PartialResponseData = {
        encrypted: {
            resp_token,
        },
    }

    // Store content inside/outside encryption depending on notify setting
    const container = displayer_config.notify_include_contents ? data : data.encrypted
    container['content'] = reason

    return respond('resend', data)
}


export function respond_subscribe(form:string, address:string, name:string, content:string)
        :Promise<boolean>{
    // Send "subscribe" response
    const data:PartialResponseData = {
        form,
        encrypted: {},
    }

    // Store data inside/outside encryption depending on notify setting
    const container = displayer_config.notify_include_contents ? data : data.encrypted
    container['address'] = address
    container['name'] = name
    container['content'] = content  // Use 'content' to match replies/notification logic

    return respond('subscribe', data)
}

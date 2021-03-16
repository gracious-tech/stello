// Placeholders for browser env to prevent breaking on load (can't actually support these)

import {EmailSettings, Email, EmailError, EmailIdentity} from './types'


export async function dns_mx(host:string):Promise<string[]>{
    return []
}


export async function test_email_settings(settings:EmailSettings):Promise<EmailError>{
    return {
        code: "NOT_SUPPORTED",
        message: "",
        response: "",
    }
}


export async function send_emails(settings:EmailSettings, emails:Email[], from:EmailIdentity,
        no_reply:boolean):Promise<EmailError[]>{
    return emails.map(email => {
        return {
            code: "NOT_SUPPORTED",
            message: "",
            response: "",
        }
    })
}


export function on_oauth(handler:(url:string)=>void):void{
    // Will never receive events...
}

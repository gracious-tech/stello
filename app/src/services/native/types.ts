
export interface NativeInterface {
    // The methods available for interacting with native platform

    // Functions
    update():void
    dns_mx(host:string):Promise<string[]>
    test_email_settings(settings:EmailSettings, auth?:boolean):Promise<EmailError|undefined>
    send_emails(settings:EmailSettings, emails:Email[], from:EmailIdentity, reply_to?:EmailIdentity)
        :Promise<EmailError|undefined>

    // Listeners
    on_update_ready(handler:()=>void):void
    on_oauth(handler:(url:string)=>void):void
    on_email_submitted(handler:(email_id:string, accepted:boolean)=>void):void
}


export interface EmailSettings {
    host:string
    port:number
    starttls:boolean
    user:string
    pass:string
}

export interface Email {
    id:string
    to:EmailIdentity
    subject:string
    html:string
}

export interface EmailIdentity {
    name:string
    address:string
}

export interface EmailError {
    code:'network'|'dns'|'starttls_required'|'tls_required'|'auth'|'timeout'|'unknown'|'unsupported'
    details:string
}

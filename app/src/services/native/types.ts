
export interface NativeInterface {
    // The methods available for interacting with native platform

    // Functions
    read_file(path:string):Promise<ArrayBuffer>
    update():void
    dns_mx(host:string):Promise<string[]>
    test_email_settings(settings:EmailSettings, auth?:boolean):Promise<EmailError|undefined>
    smtp_send(settings:EmailSettings, email:Email):Promise<EmailError|null>

    // Listeners
    on_update_ready(handler:()=>void):void
    on_oauth(handler:(url:string)=>void):void
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
    from:EmailIdentity
    reply_to:EmailIdentity|undefined
    subject:string
    html:string
}

export interface EmailIdentity {
    name:string
    address:string
}

export interface EmailError {
    code:'network'|'dns'|'starttls_required'|'tls_required'|'auth'|'timeout'|'throttled'
        |'invalid_to'|'unknown'|'unsupported'
    details:string
}

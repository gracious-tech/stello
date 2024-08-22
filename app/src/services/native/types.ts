
export interface NativeInterface {
    // The methods available for interacting with native platform

    // Functions
    read_app_file(path:string):Promise<ArrayBuffer>
    update():void
    dns_mx(host:string):Promise<string[]>
    os_encrypt(secret:string):Promise<ArrayBuffer|null>
    os_decrypt(encrypted:ArrayBuffer):Promise<string|null>
    test_email_settings(settings:EmailSettings, auth?:boolean):Promise<EmailError|null>
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
    subject:string
    html:string
    reply_to?:EmailIdentity|undefined
}

export interface EmailIdentity {
    name:string
    address:string
}

export interface EmailError {
    code:'network'|'dns'|'port'|'starttls_required'|'tls_required'|'auth'|'timeout'|'throttled'
        |'invalid_to'|'unknown'|'unsupported'
    details:string
}

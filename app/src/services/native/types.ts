
export interface EmailSettings {
    host:string
    port:number
    starttls:boolean
    user:string
    pass:string
}

export interface Email {
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

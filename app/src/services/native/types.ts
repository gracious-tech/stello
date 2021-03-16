
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
    code:string
    message:string
    response:string
}

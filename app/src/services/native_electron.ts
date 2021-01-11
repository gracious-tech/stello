// Utilities that either rely on native features or are extended by them

import {IpcRenderer} from 'electron'  // Just for type (injected via preload.js)


// Functions


export function test_email_settings(settings:EmailSettings):Promise<EmailError>{
    // Tests provided settings to see if they work and returns either null or error string
    return self.ipcRenderer.invoke('test_email_settings', settings)
}


export function send_emails(settings:EmailSettings, emails:Email[], from:EmailIdentity,
        no_reply:boolean):Promise<EmailError[]>{
    return self.ipcRenderer.invoke('send_emails', settings, emails, from, no_reply)
}


// Types


declare global {
    interface Window {
        ipcRenderer:IpcRenderer
    }
}

interface EmailSettings {
    host:string
    port:number
    user:string
    pass:string
}

interface Email {
    to:EmailIdentity
    subject:string
    html:string
}

interface EmailIdentity {
    name:string
    address:string
}

interface EmailError {
    code:string
    message:string
    response:string
}

// Utilities that either rely on native features or are extended by them

import {IpcRenderer} from 'electron'  // Just for type (injected via preload.js)

import {EmailSettings, Email, EmailError, EmailIdentity} from './types'


declare global {
    interface Window {
        ipcRenderer:IpcRenderer
    }
}


// Functions


export function dns_mx(host:string):Promise<string[]>{
    // Do a DNS request for MX records and return domains ordered by priority
    return self.ipcRenderer.invoke('dns_mx', host)
}


export async function test_email_settings(settings:EmailSettings, auth:boolean=true)
        :Promise<EmailError>{
    // Tests provided settings to see if they work and returns either null or error string
    const error = await self.ipcRenderer.invoke('test_email_settings', settings, auth)
    if (error){
        console.warn(error)  // Since specifically for testing, expected that errors will be handled
    }
    return error
}


export function send_emails(settings:EmailSettings, emails:Email[], from:EmailIdentity,
        no_reply:boolean):Promise<EmailError[]>{
    return self.ipcRenderer.invoke('send_emails', settings, emails, from, no_reply)
}


// Listeners


export function on_oauth(handler:(url:string)=>void):void{
    // Listen to oauth redirect events by providing a handler
    self.ipcRenderer.on('oauth', (event, url) => {
        handler(url)
    })
}

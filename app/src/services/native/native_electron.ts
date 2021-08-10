// Utilities that either rely on native features or are extended by them

import {IpcRenderer} from 'electron'  // Just for type (injected via preload.js)

import {EmailSettings, Email, EmailError, EmailIdentity} from './types'


declare global {
    interface Window {
        ipcRenderer:IpcRenderer
    }
}


// Functions


export async function restart():Promise<void>{
    // Tell electron to restart
    self.ipcRenderer.invoke('restart')
}


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
        reply_to?:EmailIdentity):Promise<EmailError>{
    // Send emails
    return self.ipcRenderer.invoke('send_emails', settings, emails, from, reply_to)
}


// Listeners


export function on_update(handler:()=>void):void{
    // Listen to update events emitted by native platform
    self.ipcRenderer.on('update', event => {
        handler()
    })
}


export function on_oauth(handler:(url:string)=>void):void{
    // Listen to oauth redirect events emitted by native platform
    self.ipcRenderer.on('oauth', (event, url) => {
        handler(url)
    })
}


export function on_email_submitted(handler:(email_id:string, accepted:boolean)=>void):void{
    // Listen to email_submitted events emitted by native platform
    self.ipcRenderer.on('email_submitted', (event, email_id, accepted) => {
        handler(email_id, accepted)
    })
}

// Expose methods in renderer that send ipc messages to node backend
// NOTE This module is executed in isolation to renderer thanks to contextIsolation
// SECURITY This prevents the whole ipcRenderer module from being exposed

import {contextBridge, ipcRenderer} from 'electron'

import {EmailSettings, Email, EmailError, EmailIdentity, NativeInterface} from './native_types'


const native_electron:NativeInterface = {

    // Functions

    update():void{
        // Tell electron to update
        ipcRenderer.invoke('update')
    },

    dns_mx(host:string):Promise<string[]>{
        // Do a DNS request for MX records and return domains ordered by priority
        return ipcRenderer.invoke('dns_mx', host)
    },

    async test_email_settings(settings:EmailSettings, auth=true):Promise<EmailError|undefined>{
        // Tests provided settings to see if they work and returns either null or error string
        const error = await ipcRenderer.invoke('test_email_settings', settings, auth)
        if (error){
            console.warn(error)
        }
        return error
    },

    send_emails(settings:EmailSettings, emails:Email[], from:EmailIdentity,
            reply_to?:EmailIdentity):Promise<EmailError|undefined>{
        // Send emails
        return ipcRenderer.invoke('send_emails', settings, emails, from, reply_to)
    },


    // Listeners

    on_update_ready(handler:()=>void):void{
        // Listen to update events emitted by native platform
        ipcRenderer.on('update_ready', event => {
            handler()
        })
    },

    on_oauth(handler:(url:string)=>void):void{
        // Listen to oauth redirect events emitted by native platform
        ipcRenderer.on('oauth', (event, url) => {
            handler(url)
        })
    },

    on_email_submitted(handler:(email_id:string, accepted:boolean)=>void):void{
        // Listen to email_submitted events emitted by native platform
        ipcRenderer.on('email_submitted', (event, email_id, accepted) => {
            handler(email_id, accepted)
        })
    },
}


// Expose in renderer
contextBridge.exposeInMainWorld('app_native', native_electron)

// Expose methods in renderer that send ipc messages to node backend
// NOTE This module is executed in isolation to renderer thanks to contextIsolation
// SECURITY This prevents the whole ipcRenderer module from being exposed

import {contextBridge, ipcRenderer} from 'electron'

import {EmailSettings, Email, EmailError, NativeInterface} from './native_types'


const native_electron:NativeInterface = {

    // Functions

    update():void{
        // Tell electron to update
        void ipcRenderer.invoke('update')
    },

    dns_mx(host:string):Promise<string[]>{
        // Do a DNS request for MX records and return domains ordered by priority
        return ipcRenderer.invoke('dns_mx', host) as Promise<string[]>
    },

    async test_email_settings(settings:EmailSettings, auth=true):Promise<EmailError|undefined>{
        // Tests provided settings to see if they work and returns either null or error string
        const error =
            await ipcRenderer.invoke('test_email_settings', settings, auth) as EmailError|undefined
        if (error){
            console.warn(error)
        }
        return error
    },

    smtp_send(settings:EmailSettings, email:Email):Promise<EmailError|null>{
        // Send an email via SMTP
        return ipcRenderer.invoke('smtp_send', settings, email) as Promise<EmailError|null>
    },

    smtp_close(settings:EmailSettings):Promise<void>{
        // Close an smtp transport (so can reject all queued emails)
        return ipcRenderer.invoke('smtp_close', settings) as Promise<void>
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
}


// Expose in renderer
contextBridge.exposeInMainWorld('app_native', native_electron)

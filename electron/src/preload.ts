// Expose methods in renderer that send ipc messages to node backend
// NOTE This module is executed in isolation to renderer thanks to contextIsolation
// SECURITY This prevents the whole ipcRenderer module from being exposed

import {contextBridge, ipcRenderer} from 'electron'

import {EmailSettings, Email, EmailError, NativeInterface} from './native_types'


const native_electron:NativeInterface = {

    // Functions

    read_file(path:string){
        // Read a file and return as an ArrayBuffer (must be within app's dir)
        return ipcRenderer.invoke('read_file', path) as Promise<ArrayBuffer>
    },

    update():void{
        // Tell electron to update
        void ipcRenderer.invoke('update')
    },

    dns_mx(host:string):Promise<string[]>{
        // Do a DNS request for MX records and return domains ordered by priority
        return ipcRenderer.invoke('dns_mx', host) as Promise<string[]>
    },

    os_encrypt(secret:string):Promise<ArrayBuffer|null>{
        return ipcRenderer.invoke('os_encrypt', secret) as Promise<ArrayBuffer|null>
    },

    os_decrypt(encrypted:ArrayBuffer):Promise<string|null>{
        return ipcRenderer.invoke('os_decrypt', encrypted) as Promise<string|null>
    },

    async test_email_settings(settings:EmailSettings, auth=true):Promise<EmailError|null>{
        // Tests provided settings to see if they work and returns either null or error string
        const error =
            await ipcRenderer.invoke('test_email_settings', settings, auth) as EmailError|null
        if (error){
            console.warn(error)
        }
        return error
    },

    smtp_send(settings:EmailSettings, email:Email):Promise<EmailError|null>{
        // Send an email via SMTP
        return ipcRenderer.invoke('smtp_send', settings, email) as Promise<EmailError|null>
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

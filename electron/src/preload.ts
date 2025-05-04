// Expose methods in renderer that send ipc messages to node backend
// NOTE This module is executed in isolation to renderer thanks to contextIsolation
// SECURITY This prevents the whole ipcRenderer module from being exposed

import {contextBridge, ipcRenderer} from 'electron'

import {EmailSettings, Email, EmailError, NativeInterface} from './native_types'


const native_electron:NativeInterface = {

    // Functions

    app_file_read(path:string){
        // Read a file and return as an ArrayBuffer (must be within app's dir)
        return ipcRenderer.invoke('app_file_read', path) as Promise<ArrayBuffer>
    },

    user_file_list(path:string){
        return ipcRenderer.invoke('user_file_list', path) as Promise<string[]>
    },

    user_file_write(path:string, data:ArrayBuffer){
        return ipcRenderer.invoke('user_file_write', path, data) as Promise<void>
    },

    user_file_remove(path:string){
        return ipcRenderer.invoke('user_file_remove', path) as Promise<void>
    },

    restart_after_update():void{
        // Tell electron to restart after an update (doesn't trigger the update)
        void ipcRenderer.invoke('restart_after_update')
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

    html_to_pdf(html:string, filename:string):Promise<null>{
        return ipcRenderer.invoke('html_to_pdf', html, filename) as Promise<null>
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
            handler(url as string)
        })
    },
}


// Expose in renderer
contextBridge.exposeInMainWorld('app_native', native_electron)

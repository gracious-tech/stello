// A non-operational implementation of native interface for browser env for use during dev

import {EmailSettings, Email, EmailError, NativeInterface} from './types'


export class NativeBrowser implements NativeInterface {

    async read_app_file(path:string):Promise<ArrayBuffer>{
        throw new Error('unsupported')
    }

    update():void{
        self.location.assign('#/')
        self.location.reload()
    }

    async dns_mx(host:string):Promise<string[]>{
        return []
    }

    async os_encrypt(secret:string):Promise<ArrayBuffer|null>{
        return null
    }

    async os_decrypt(encrypted:ArrayBuffer):Promise<string|null>{
        return null
    }

    async test_email_settings(settings:EmailSettings, auth=true):Promise<EmailError>{
        return {code: 'unsupported', details: ""}
    }

    async smtp_send(settings:EmailSettings, email:Email):Promise<EmailError|null>{
        throw new Error('unsupported')
    }

    on_update_ready(handler:()=>void):void{
        // Will never receive events...
    }

    on_oauth(handler:(url:string)=>void):void{
        // Will never receive events...
    }
}

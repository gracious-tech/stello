// A non-operational implementation of native interface for browser env for use during dev

import {EmailSettings, Email, EmailError, NativeInterface} from './types'


export class NativeBrowser implements NativeInterface {

    get_paths(){
        return {files_dir: 'localhost', data_dir: 'localhost'}
    }

    async app_file_read(path:string):Promise<ArrayBuffer>{
        throw new Error('unsupported')
    }

    async user_file_list(path:string):Promise<string[]>{
        return []
    }

    async user_file_write(path:string, data:ArrayBuffer):Promise<void>{
        // Will not actually write anything
    }

    async user_file_remove(path:string):Promise<void>{
        // Will not actually remove anything
    }

    restart_after_update():void{
        return
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

    async html_to_pdf(html:string, filename:string):Promise<null>{
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

// A non-operational implementation of native interface for browser env for use during dev

import {EmailSettings, Email, EmailError, EmailIdentity, NativeInterface} from './types'


export class NativeBrowser implements NativeInterface {

    update():void{
        self.location.assign('#/')
        self.location.reload()
    }

    async dns_mx(host:string):Promise<string[]>{
        return []
    }


    async test_email_settings(settings:EmailSettings, auth=true):Promise<EmailError>{
        return {code: 'unsupported', details: ""}
    }


    async send_emails(settings:EmailSettings, emails:Email[], from:EmailIdentity,
            reply_to?:EmailIdentity):Promise<EmailError>{
        return {code: 'unsupported', details: ""}
    }


    on_update_ready(handler:()=>void):void{
        // Will never receive events...
    }


    on_oauth(handler:(url:string)=>void):void{
        // Will never receive events...
    }


    on_email_submitted(handler:(email_id:string, accepted:boolean)=>void):void{
        // Will never receive events...
    }
}

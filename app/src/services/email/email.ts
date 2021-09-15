
import {Email, EmailSettings} from '../native/types'
import {MustReconfigure} from '../utils/exceptions'
import {new_smtp_task} from './smtp'
import {send_emails_oauth_google} from './google'
import {send_emails_oauth_microsoft} from './microsoft'
import { Profile } from '../database/profiles'


export interface EmailTask {
    send:(email:Email)=>Promise<boolean>
    abort:()=>void
}


export async function new_email_task(settings:Profile['smtp_settings']):Promise<EmailTask>{
    // Init a new email task, returning access to send/abort methods
    if (settings.oauth){
        const oauth = await self.app_db.oauths.get(settings.oauth)
        if (oauth?.issuer === 'google'){
            //return send_emails_oauth_google(oauth)
        } else if (oauth?.issuer === 'microsoft'){
            //return send_emails_oauth_microsoft(oauth)
        }
    } else if (settings.pass){
        return new_smtp_task(settings as EmailSettings)
    }

    // SMTP hasn't been configured yet, or was removed (e.g. oauth record deleted)
    throw new MustReconfigure()
}

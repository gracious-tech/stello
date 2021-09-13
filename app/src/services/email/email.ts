
import {Profile} from '../database/profiles'
import {EmailIdentity} from '../native/types'
import {MustReconfigure} from '../utils/exceptions'
import {send_emails_smtp} from './smtp'
import {send_emails_oauth_google} from './google'
import {send_emails_oauth_microsoft} from './microsoft'


export interface Email {
    id:string
    to:EmailIdentity
    from:EmailIdentity
    reply_to:EmailIdentity|undefined
    subject:string
    html:string
}


export async function handle_email_submitted(email_id:string, accepted:boolean):Promise<void>{
    // Handle email submitted events by setting `invited` property on copy
    const copy = await self.app_db.copies.get(email_id)
    if (copy){
        copy.invited = accepted
        void self.app_db.copies.set(copy)
        // NOTE A little hacky, but currently emitting email sent events via watching a store prop
        self.app_store.state.tmp.invited = copy
    }
}


export async function send_email(smtp_settings:Profile['smtp_settings'], email:Email):Promise<void>{
    // Send given email
    if (smtp_settings.oauth){
        const oauth = await self.app_db.oauths.get(smtp_settings.oauth)
        if (oauth?.issuer === 'google'){
            return send_emails_oauth_google(oauth, [email])
        } else if (oauth?.issuer === 'microsoft'){
            return send_emails_oauth_microsoft(oauth, [email])
        }
    } else if (smtp_settings.pass){
        return send_emails_smtp(smtp_settings, email)
    }

    // SMTP hasn't been configured yet, or was removed (e.g. oauth record deleted)
    throw new MustReconfigure()
}

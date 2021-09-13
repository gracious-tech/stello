
import {Email} from './email'
import {Profile} from '../database/profiles'
import {EmailSettings} from '../native/types'
import {MustReauthenticate, MustReconfigure, MustReconnect} from '../utils/exceptions'


export async function send_emails_smtp(smtp_settings:Profile['smtp_settings'],
        email:Email):Promise<void>{
    // Send emails via SMTP
    const error = await self.app_native.send_emails(
        smtp_settings as EmailSettings, [email], email.from, email.reply_to)
    // Translate email error to standard forms
    if (error){
        if (['dns', 'starttls_required', 'tls_required', 'timeout'].includes(error.code)){
            throw new MustReconfigure(error.details)
        } else if (error.code === 'auth'){
            throw new MustReauthenticate(error.details)
        } else if (error.code === 'network'){
            throw new MustReconnect(error.details)
        }
        throw new Error(error.details)
    }
}


import {QueueItem} from './email'
import {EmailSettings} from '../native/types'
import {BadEmailAddress} from './utils'
import {MustInterpret, MustReauthenticate, MustReconfigure, MustReconnect, MustWait}
    from '../utils/exceptions'


export function send_batch_smtp(items:QueueItem[],
        settings:EmailSettings):Promise<[QueueItem, unknown][]>{
    // Send batch of emails via SMTP
    // NOTE Doesn't actually support batching, instead simulates with parallel execution
    //      But won't be performant. Should disable batching for SMTP and increase processors
    return Promise.all(items.map(async item => {

        const smtp_error = await self.app_native.smtp_send(settings, item.email)

        // Map smtp error to a general error
        let error
        if (!smtp_error){
            error = null
        } else if (smtp_error.code === 'invalid_to'){
            error = new BadEmailAddress()
        } else if (smtp_error.code === 'throttled'){
            error = new MustWait()
        } else if (smtp_error.code === 'auth'){
            error = new MustReauthenticate()
        } else if (smtp_error.code === 'network'){
            error = new MustReconnect()
        } else if (
            ['dns', 'starttls_required', 'tls_required', 'timeout'].includes(smtp_error.code)){
            error = new MustReconfigure()
        } else {
            error = new MustInterpret(smtp_error)
        }

        return [item, error] as [QueueItem, unknown]
    }))
}

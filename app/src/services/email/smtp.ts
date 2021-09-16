
import {QueueItem} from './email'
import {EmailError, EmailSettings} from '../native/types'


export function send_batch_smtp(items:QueueItem[],
        settings:EmailSettings):Promise<[QueueItem, EmailError|null][]>{
    // Send batch of emails via SMTP
    // NOTE Doesn't actually support batching, instead simulates with parallel execution
    return Promise.all(items.map(async item => {
        return [
            item,
            await self.app_native.smtp_send(settings, item.email),
        ] as [QueueItem, EmailError|null]
    }))
}

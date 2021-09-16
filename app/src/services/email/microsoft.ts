
import {OAuth} from '../database/oauths'
import {oauth_request} from '../tasks/oauth'
import {MustWait, MustInterpret} from '../utils/exceptions'
import {QueueItem} from './email'


interface MicrosoftBatchResponse {
    // See https://docs.microsoft.com/en-us/graph/json-batching
    responses:{
        id:string,
        status:number,
        body?:null|{
            error:{
                code:string,
            },
        },
    }[]
}


export async function send_batch_microsoft(items:QueueItem[],
        oauth:OAuth):Promise<[QueueItem, unknown][]>{
    // Send batch of emails via oauth http request to Microsoft's API

    // Make request (network error throws don't need catching)
    const url = 'https://graph.microsoft.com/v1.0/$batch'
    const resp = await oauth_request(oauth, url, undefined, 'POST', {
        requests: items.map(item => {
            const email = item.email
            return {
                id: email.id,
                method: 'POST',
                url: '/me/sendMail',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: {
                    saveToSentItems: false,
                    message: {
                        from: {emailAddress: email.from},
                        toRecipients: [{emailAddress: email.to}],
                        replyTo: email.reply_to && [{emailAddress: email.reply_to}],
                        subject: email.subject,
                        body: {
                            contentType: 'html',
                            content: email.html,
                        },
                    },
                },
            }
        }),
    })

    // Batch request should never fail, even if subrequests do
    if (resp.status >= 500 && resp.status < 600){
        throw new MustWait()  // Third-party issue that will probably resolve over time
    } else if (!resp.ok){
        throw new MustInterpret({status: resp.status, body: await resp.json() as unknown})
    }

    // Parse body to know individual request results
    const body = await resp.json() as MicrosoftBatchResponse

    // Map errors back to their items, ensuring every item returned
    // https://docs.microsoft.com/en-us/graph/json-batching
    // https://docs.microsoft.com/en-us/graph/errors
    return items.map(item => {

        // Find the item's result
        const sub_resp = body.responses.find(canditate => canditate.id === item.email.id)
        if (!sub_resp){
            return [item, new Error("Missing result from Microsoft batch send")]
        }

        // Handle different response codes
        if (sub_resp.status >= 200 && sub_resp.status < 300){
            // NOTE Success response should usually be 202
            return [item, null]
        }
        return [item, new MustInterpret(sub_resp)]
    })
}

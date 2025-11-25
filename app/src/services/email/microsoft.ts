
import {OAuth} from '../database/oauths'
import {oauth_request} from '../tasks/oauth'
import {MustWait, MustInterpret, MustReauthenticate} from '../utils/exceptions'
import {QueueItem} from './email'
import {BadEmailAddress} from './utils'


interface MicrosoftBatchResponse {
    // See https://docs.microsoft.com/en-us/graph/json-batching
    responses:{
        id:string,
        status:number,
        body?:null|{
            error?:{
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
                    saveToSentItems: true,  // Necessary for debug; user should trust own account
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
            // Success (should usually be 202)
            return [item, null]
        } else if (sub_resp.status === 400
                && sub_resp.body?.error?.code === 'ErrorInvalidRecipients'){
            return [item, new BadEmailAddress()]
        } else if (sub_resp.status === 401){
            // Common code for needing to authenticate
            return [item, new MustReauthenticate()]
        } else if (sub_resp.status === 403){
            // May be throttled or bad auth
            if (sub_resp.body?.error?.code === 'ErrorMessageTransientError'){
                return [item, new MustWait()]  // Some kind of rate/amount limiting
            }
            return [item, new MustReauthenticate()]
        } else if (sub_resp.status === 429){
            // Throttled
            return [item, new MustWait()]
        } else if (sub_resp.status >= 500 && sub_resp.status < 600){
            // Server issue, so retry and hope resolves itself
            return [item, new MustWait()]
        }
        return [item, new MustInterpret(sub_resp)]
    })
}

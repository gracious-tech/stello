
import {chunk} from 'lodash'
import {OAuth} from '../database/oauths'
import {oauth_request} from '../tasks/oauth'
import {concurrent} from '../utils/async'
import {MustWait, MustInterpret} from '../utils/exceptions'
import {Email} from './email'


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


export async function send_emails_oauth_microsoft(oauth:OAuth, emails:Email[]):Promise<void>{
    // Send emails via oauth http requests to Microsoft's API
    const url = 'https://graph.microsoft.com/v1.0/$batch'
    const limit_per_batch = 20
    const limit_concurrent_requests = 4
    const batches = chunk(emails, limit_per_batch)
    await concurrent(batches.map(batch => {
        return async () => {

            // Do batch request
            await interpret_microsoft_response(await oauth_request(oauth, url, undefined, 'POST', {
                requests: batch.map(email => {
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
            }))
        }
    }), limit_concurrent_requests)
}


async function interpret_microsoft_response(resp:Response):Promise<void>{
    // Interpret Outlook API response, throwing appropriate errors
    // https://docs.microsoft.com/en-us/graph/json-batching
    // https://docs.microsoft.com/en-us/graph/errors

    // Batch request should never fail, even if subrequests do
    if (resp.status >= 500 && resp.status < 600){
        throw new MustWait()  // Third-party issue that will probably resolve over time
    } else if (!resp.ok){
        throw new MustInterpret({status: resp.status, body: await resp.json() as unknown})
    }

    // Parse body to know individual request results
    const body = await resp.json() as MicrosoftBatchResponse

    // Process each sub-response individually
    // WARN Do not throw until all analysed
    const bad_statuses:number[] = []
    for (const sub_resp of body.responses){
        // NOTE Success response should be 202
        if (sub_resp.status >= 200 && sub_resp.status < 300){
            await handle_email_submitted(sub_resp.id, true)
        } else {
            bad_statuses.push(sub_resp.status)
        }
    }

    // Can now throw after analysing all sub responses
    if (bad_statuses.length){
        throw new Error()  // TODO differentiate
    }
}

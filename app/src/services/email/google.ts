
import {OAuth} from '../database/oauths'
import {OauthUseless, oauth_request} from '../tasks/oauth'
import {MustInterpret, MustReauthenticate, MustWait} from '../utils/exceptions'
import {QueueItem} from './email'
import {BadEmailAddress, create_email} from './utils'


export async function send_batch_google(items:QueueItem[],
        oauth:OAuth):Promise<[QueueItem, unknown][]>{
    // Send emails via oauth http request to Google's API
    // For limits see https://www.gmass.co/blog/understanding-gmails-email-sending-limits/

    // Batching not currently implemented (got 400s with no error details when attempted)
    if (items.length !== 1){
        throw new Error(`send_batch_google expects exactly one item, not ${items.length}`)
    }
    const item = items[0]!
    const email = item.email

    // Google's API expects a raw email
    // NOTE Ignore Google's rubbish about base64 encoding the message
    const raw_email = create_email(email.from, email.to, email.subject, email.html, email.reply_to)
    const body = new Blob([raw_email], {type: 'message/rfc822'})

    // Send the email
    const url = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send'
    const resp = await oauth_request(oauth, url, undefined, 'POST', body)

    // Interpret the response
    try {
        await interpret_gmail_response(resp)
    } catch (error){
        return [[item, error]]
    }
    return [[item, null]]
}


interface GmailResponse {
    error?:{
        code?:number
        status?:string
        message?:string
        errors?:{
            message?:string
            domain?:string
            reason?:string
        }[]
    }
}


async function interpret_gmail_response(resp:Response):Promise<void>{
    // Interpret gmail API response, throwing appropriate errors
    // See https://developers.google.com/gmail/api/guides/handle-errors

    // All good if success
    if (resp.ok){
        return
    }

    // Parse body and extract useful fields
    let body:GmailResponse|null = null
    try {
        body = await resp.json() as GmailResponse
    } catch {
        // Body not available or not as expected
    }
    const error_status = String(body?.error?.status ?? '')
    const error_message = String(body?.error?.message ?? '').toLowerCase()
    const error_reason = String(body?.error?.errors?.[0]?.reason ?? '')  // Usually only one item

    // Interpret errors
    if (resp.status === 400){
        if (error_status === 'FAILED_PRECONDITION'){
            throw new OauthUseless()  // Not a gmail account (e.g. signin only)
        }
        if (error_message.includes('invalid to header')){
            throw new BadEmailAddress()  // Contact's address is probably invalid
        }
    }

    if (resp.status === 401){
        throw new MustReauthenticate()  // Straight forward auth error
    }

    if (resp.status === 403){
        if (error_reason === 'domainPolicy'){
            throw new OauthUseless()  // Google workspace disabled app access (to e.g. gmail)
        }
        if (error_reason.includes('LimitExceeded')){
            // Includes: dailyLimitExceeded, userRateLimitExceeded, rateLimitExceeded
            throw new MustWait()  // Gmail usually seems to respond with 429 but 403 in docs too
        }
        // If didn't handle a 403 yet then probably safe to assume it's an auth issue
        throw new MustReauthenticate()
    }

    if (resp.status === 429){
        throw new MustWait()  // Have been rate limited
    }

    if (resp.status >= 500 && resp.status < 600){
        throw new MustWait()  // Third-party issue that will probably resolve over time
    }

    // Needs reporting
    throw new MustInterpret({status: resp.status, body})
}

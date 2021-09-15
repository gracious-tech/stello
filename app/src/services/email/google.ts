
import {OAuth} from '../database/oauths'
import {OauthUseless, oauth_request} from '../tasks/oauth'
import {concurrent} from '../utils/async'
import {MustInterpret, MustReauthenticate, MustWait} from '../utils/exceptions'
import {Email} from './email'
import {create_email} from './utils'


export async function send_emails_oauth_google(oauth:OAuth, emails:Email[]):Promise<void>{
    // Send emails via oauth http requests to Google's API
    // NOTE Google allows 2.5 sends/second (average over time), and each request takes ~1.5 seconds
    //      But to be safe, let's assume requests take 1 second, then two channels are suitable
    // For limits see https://www.gmass.co/blog/understanding-gmails-email-sending-limits/
    const limit_concurrent_requests = 2
    const url = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send'
    await concurrent(emails.map(email => {
        return async () => {
            // Google's API expects a raw email
            // NOTE Ignore Google's rubbish about base64 encoding the message
            const raw_email =
                create_email(email.from, email.to, email.subject, email.html, email.reply_to)
            const body = new Blob([raw_email], {type: 'message/rfc822'})
            await interpret_gmail_response(
                await oauth_request(oauth, url, undefined, 'POST', body),
                email.id,
            )
        }
    }), limit_concurrent_requests)
}


async function interpret_gmail_response(resp:Response, email_id:string):Promise<void>{
    // Interpret gmail API response, throwing appropriate errors
    // See https://developers.google.com/gmail/api/guides/handle-errors

    // All good if success
    if (resp.ok){
        await handle_email_submitted(email_id, true)
        return
    }

    // Handle status codes that are unambiguous
    // WARN Do not handle 403 yet as Gmail uses for rate limiting too, so must check body first
    if (resp.status === 401){
        throw new MustReauthenticate()
    } else if (resp.status === 429){
        throw new MustWait()  // Have been rate limited
    } else if (resp.status >= 500 && resp.status < 600){
        throw new MustWait()  // Third-party issue that will probably resolve over time
    }

    // Need to parse body to know any more
    /* eslint-disable @typescript-eslint/no-explicit-any,
        @typescript-eslint/no-unsafe-member-access -- unknown not suitable for long chains */
    let body:any = null
    try {
        body = await resp.json() as unknown

        // Extract useful fields
        const error_status = String(body?.error?.status)
        const error_message = String(body?.error?.message).toLowerCase()
        const error_reason = String(body?.error?.errors?.[0]?.reason)  // Usually only one sub-error

        if (resp.status === 400){
            if (error_status === 'FAILED_PRECONDITION'){
                throw new OauthUseless()  // Not a gmail account (e.g. signin only)
            }
        }

        if (resp.status === 403){
            if (error_reason === 'domainPolicy'){
                throw new OauthUseless()  // Google workspace disabled app access (to e.g. gmail)
            }
            if (error_reason.includes('LimitExceeded')){
                // Includes: dailyLimitExceeded, userRateLimitExceeded, rateLimitExceeded
                throw new MustWait()  // Gmail usually seems to respond with 429 but 403 in docs too
            }
        }

        if (error_message.includes('invalid to header')){
            // Contact's address is probably invalid so don't hard fail
            await handle_email_submitted(email_id, false)
            return
        }
        /* eslint-enable */
    } catch {
        // Body not available or not as expected
    }

    // If didn't handle a 403 yet then probably safe to assume it's an auth issue
    if (resp.status === 403){
        throw new MustReauthenticate()
    }

    // Needs reporting
    throw new MustInterpret({status: resp.status, body: body as unknown})
}

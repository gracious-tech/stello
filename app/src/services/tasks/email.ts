
import {chunk} from 'lodash'

import {OAuth} from '../database/oauths'
import {Profile} from '../database/profiles'
import {create_email} from '../misc/email'
import {Email, EmailIdentity, EmailSettings} from '../native/types'
import {concurrent} from '../utils/async'
import {MustInterpret, MustReauthenticate, MustReconfigure, MustReconnect, MustWait}
    from '../utils/exceptions'
import {oauth_request, OauthUseless} from './oauth'


// TYPES


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


// EXPORTS


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


export async function send_emails(smtp_settings:Profile['smtp_settings'], emails:Email[],
        from:EmailIdentity, reply_to?:EmailIdentity):Promise<void>{
    // Send given emails
    if (smtp_settings.oauth){
        const oauth = await self.app_db.oauths.get(smtp_settings.oauth)
        if (oauth?.issuer === 'google'){
            return send_emails_oauth_google(oauth, emails, from, reply_to)
        } else if (oauth?.issuer === 'microsoft'){
            return send_emails_oauth_microsoft(oauth, emails, from, reply_to)
        }
    } else if (smtp_settings.pass){
        return send_emails_smtp(smtp_settings, emails, from, reply_to)
    }

    // SMTP hasn't been configured yet, or was removed (e.g. oauth record deleted)
    throw new MustReconfigure()
}


// INTERNAL


async function send_emails_smtp(smtp_settings:Profile['smtp_settings'], emails:Email[],
        from:EmailIdentity, reply_to?:EmailIdentity):Promise<void>{
    // Send emails via SMTP
    const error = await self.app_native.send_emails(
        smtp_settings as EmailSettings, emails, from, reply_to)
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


async function send_emails_oauth_google(oauth:OAuth, emails:Email[], from:EmailIdentity,
        reply_to?:EmailIdentity):Promise<void>{
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
            const raw_email = create_email(from, email.to, email.subject, email.html, reply_to)
            const body = new Blob([raw_email], {type: 'message/rfc822'})
            await interpret_gmail_response(
                await oauth_request(oauth, url, undefined, 'POST', body),
                email.id,
            )
        }
    }), limit_concurrent_requests)
}


async function send_emails_oauth_microsoft(oauth:OAuth, emails:Email[], from:EmailIdentity,
        reply_to?:EmailIdentity):Promise<void>{
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
                                from: {emailAddress: from},
                                toRecipients: [{emailAddress: email.to}],
                                replyTo: reply_to && [{emailAddress: reply_to}],
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

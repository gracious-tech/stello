
import {chunk} from 'lodash'

import {OAuth} from '../database/oauths'
import {create_email} from '../misc/email'
import {Email, EmailIdentity} from '../native/types'
import {concurrent} from '../utils/async'
import {MustInterpret} from '../utils/exceptions'
import {oauth_request} from './oauth'


// TYPES


interface MicrosoftBatchResponse {
    responses:{id:string, status:number}[]
}


// EXPORTS


export async function handle_email_submitted(email_id:string, accepted:boolean):Promise<void>{
    // Handle email submitted events by setting `invited` property on copy
    const copy = await self._db.copies.get(email_id)
    copy.invited = accepted
    self._db.copies.set(copy)
    // NOTE A little hacky, but currently emitting email sent events via watching a store prop
    self._store.state.tmp.invited = copy
}


export async function send_emails_oauth(oauth_id:string, emails:Email[], from:EmailIdentity,
        reply_to?:EmailIdentity):Promise<void>{
    // Send given emails using oauth issuer's API (rather than SMTP)
    const oauth = await self._db.oauths.get(oauth_id)
    if (oauth.issuer === 'google'){
        await send_emails_oauth_google(oauth, emails, from, reply_to)
    } else if (oauth.issuer === 'microsoft'){
        await send_emails_oauth_microsoft(oauth, emails, from, reply_to)
    } else {
        throw new Error('impossible')
    }
}


// INTERNAL


async function send_emails_oauth_google(oauth:OAuth, emails:Email[], from:EmailIdentity,
        reply_to?:EmailIdentity):Promise<void>{
    // Send emails via oauth http requests to Google's API
    // NOTE Google allows 2.5 sends/second (average over time), and each request takes ~1.5 seconds
    //      But to be safe, let's assume requests take 1 second, then two channels are suitable
    const concurrency_limit = 2
    const url = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send'
    await concurrent(emails.map(email => {
        return async () => {
            // Google's API expects a raw email
            // NOTE Ignore Google's rubbish about base64 encoding the message
            const raw_email = create_email(from, email.to, email.subject, email.html, reply_to)
            const body = new Blob([raw_email], {type: 'message/rfc822'})
            try {
                await oauth_request(oauth, url, undefined, 'POST', body)
            } catch (error){
                if (error instanceof MustInterpret){
                    if (error.data?.['body']?.error?.message?.toLowerCase() === 'invalid to header'){
                        // Contact's address is probably invalid so don't hard fail
                        handle_email_submitted(email.id, false)
                        return
                    }
                }
                throw error
            }
            handle_email_submitted(email.id, true)
        }
    }), concurrency_limit)
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
            const resp = await oauth_request(oauth, url, undefined, 'POST', {
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
            }) as MicrosoftBatchResponse

            // Process each sub-response individually
            for (const sub_resp of resp.responses){
                // NOTE Success response should be 202
                if (sub_resp.status >= 200 && sub_resp.status < 300){
                    handle_email_submitted(sub_resp.id, true)
                }
            }
        }
    }), limit_concurrent_requests)
}

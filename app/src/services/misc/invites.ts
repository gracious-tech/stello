
import {escape as html_escape} from 'lodash'  // Avoid deprecated global `escape()`

import {MessageCopy} from '@/services/database/copies'
import {export_key} from '@/services/utils/crypt'
import {replace_without_overlap} from '@/services/utils/strings'
import {buffer_to_url64} from '@/services/utils/coding'


export const INVITE_HTML_MAX_WIDTH = 600
export const INVITE_IMG_HEIGHT = INVITE_HTML_MAX_WIDTH / 3
export const INVITE_HTML_CONTAINER_STYLES =
    `border-radius: 12px; max-width: ${INVITE_HTML_MAX_WIDTH}px; margin: 0 auto;`
    + 'background-color: rgba(127, 127, 127, 0.15);'
// NOTE Some clients (e.g. Thunderbird) don't respect img aspect ratio, so max-height helps control
export const INVITE_HTML_IMAGE_STYLES =
    `border-radius: 12px 12px 0 0; width: 100%; height: auto; border-bottom: 1px solid #cccccc;`
    + `max-height: ${INVITE_IMG_HEIGHT}px; background-color: #ddeeff`


export function render_invite_html(contents:string, url:string, image:string,
        reply:boolean, encrypted_address?:string):string{
    // Render a HTML invite template with the provided contents
    // NOTE Header image must be wrapped in <a> to prevent gmail showing download button for it
    // NOTE Styles are inline so preserved when replying/forwarding
    // NOTE <hr> etc used for some separation if css disabled
    // NOTE Some styles must be directly on elements to not be overriden (e.g. color on <a>)
    let subscription_links = ''
    if (encrypted_address){
        const unsub_url = `${url},unsub,${encrypted_address}`
        const address_url = `${url},address,${encrypted_address}`
        subscription_links = `
            <hr style='border-style: none;'>
            <p>&nbsp;</p>
            <p style='text-align: center; color: #aaaaaa;'>
                <a href='${html_escape(unsub_url)}' style='color: #aaaaaa;'>
                    <small style='font-size: 0.8em;'>Unsubscribe</small></a>
                |
                <a href='${html_escape(address_url)}' style='color: #aaaaaa;'>
                    <small style='font-size: 0.8em;'>Change email address</small></a>
            </p>
        `
    }

    // NOTE meta color-scheme ensures Apple etc apply user's scheme rather than default to light
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta name='color-scheme' content='light dark'>
            <style>
                @media (prefers-color-scheme: dark){
                    .button {
                        background-color: #bbddff !important;
                        color: #000000 !important;
                    }
                }
            </style>
        </head>
        <body style='padding-top: 4px; padding-bottom: 150px;'>
            <div style='${INVITE_HTML_CONTAINER_STYLES}'>
                <a href='${html_escape(url)}'>
                    <img src='${html_escape(image)}' height='${INVITE_IMG_HEIGHT}'
                        width='${INVITE_HTML_MAX_WIDTH}' style='${INVITE_HTML_IMAGE_STYLES}'>
                </a>
                <div style='padding: 16px;'>
                    ${contents}
                </div>
                ${render_invite_html_action(url, reply)}
            </div>
            ${subscription_links}
        </body>
        </html>
    `
}


export function render_invite_html_action(url:string, reply:boolean):string{
    // Return html for the action footer of a html invite
    // NOTE Button gets lighter colors in dark mode, but won't show up in app's previews
    // NOTE &nbsp; used instead of padding as Outlook doesn't support padding
    return `
        <hr style='margin: 0; border-style: solid; border-color: #cccccc; border-width: 1px 0 0 0;'>

        <div style='border-radius: 0 0 12px 12px; background-color: rgba(87, 127, 167, 0.3);
                padding: 36px 0; text-align: center;'>

            <a class='button' href='${html_escape(url)}' style='background-color: #114488;
                    color: #ffffff; padding: 12px 0; border-radius: 12px; text-decoration: none;
                    font-family: Roboto, sans-serif;'>
                <span style='mso-text-raise: 20pt;'>&nbsp;</span>
                &nbsp;
                <strong style='mso-text-raise: 10pt;'>Open ${reply ? "Reply" : "Message"}</strong>
                &nbsp;&nbsp;
            </a>

        </div>
    `
}


interface TextInviteContext {
    contact:string
    sender:string
    title:string
    url:string
}


export function render_invite_text(template:string, {contact, sender, title, url}:TextInviteContext)
        :string{
    // Render a text invite template with the provided context

    // Replace placeholders
    let text = replace_without_overlap(template, {
        CONTACT: contact,
        SENDER: sender,
        SUBJECT: title,
        LINK: ` ${url} `,  // Pad to ensure not accidently broken by adjacent characters
    })

    // If template didn't include link placeholder, add url to end
    // WARN Do this last so that no chance of a placeholder occuring in url and being replaced
    if (!text.includes(url)){
        text += `\n\n${url}`
    }

    return text
}


export async function get_text_invite_for_copy(copy:MessageCopy):Promise<string>{
    // Get text invite for copy (regardless if normally send a HTML invite)

    // Get objects needed
    const msg = (await self.app_db.messages.get(copy.msg_id))!
    const profile = (await self.app_db.profiles.get(msg.draft.profile))!

    // Account for inheritance
    const template = profile.msg_options_identity.invite_tmpl_clipboard
    const sender = msg.draft.options_identity.sender_name
        || profile.msg_options_identity.sender_name

    // Encode shared secret
    const shared_secret_64 = buffer_to_url64(
        await export_key(profile.host_state.shared_secret))

    // Render invite
    return render_invite_text(template, {
        contact: copy.contact_hello,
        sender: sender,
        title: msg.draft.title,
        url: profile.view_url(shared_secret_64, copy.id, await export_key(copy.secret)),
    })
}

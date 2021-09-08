
import {escape as html_escape} from 'lodash'  // Avoid deprecated global `escape()`

import {MessageCopy} from '@/services/database/copies'
import {export_key} from '@/services/utils/crypt'
import {replace_without_overlap} from '@/services/utils/strings'


export const INVITE_HTML_MAX_WIDTH = 600
export const INVITE_HTML_CONTAINER_STYLES =
    `border-radius: 12px; max-width: ${INVITE_HTML_MAX_WIDTH}px; margin: 0 auto;`
    + 'background-color: #eeeeee; color: #000000;'
// NOTE Some clients (e.g. Thunderbird) don't respect img aspect ratio, so max-height helps control
export const INVITE_HTML_IMAGE_STYLES =
    `border-radius: 12px 12px 0 0; width: 100%; height: auto; border-bottom: 1px solid #cccccc;`
    + `max-height: ${INVITE_HTML_MAX_WIDTH / 3}px; background-color: #ddeeff`


export function render_invite_html(contents:string, title:string, url:string, image:string,
        reply:boolean, encrypted_address?:string):string{
    // Render a HTML invite template with the provided contents
    // NOTE Header image must be wrapped in <a> to prevent gmail showing download button for it
    // NOTE Styles are inline so preserved when replying/forwarding
    // NOTE <hr> etc used for some separation if css disabled
    // NOTE Some styles must be directly on elements to not be overriden (e.g. color on <a>)
    let subscription_links = ''
    if (encrypted_address){
        subscription_links = `
            <hr style='border-style: none;'>
            <p>&nbsp;</p>
            <p style='text-align: center; color: #aaaaaa;'>
                <a href='${url},unsub,${encrypted_address}' style='color: #aaaaaa;'>
                    <small style='font-size: 0.8em;'>Unsubscribe</small></a>
                |
                <a href='${url},address,${encrypted_address}' style='color: #aaaaaa;'>
                    <small style='font-size: 0.8em;'>Change email address</small></a>
            </p>
        `
    }
    return `
        <!DOCTYPE html>
        <html>
        <head></head>
        <body style='margin: 0; padding: 24px; padding-bottom: 150px; background-color: #222222;'>
            <div style='${INVITE_HTML_CONTAINER_STYLES}'>
                <a href='${url}'>
                    <img src='${image}' height='1' width='3' style='${INVITE_HTML_IMAGE_STYLES}'>
                </a>
                <div style='padding: 24px;'>
                    ${contents}
                </div>
                ${render_invite_html_action(title, url, reply)}
            </div>
            ${subscription_links}
        </body>
        </html>
    `
}


export function render_invite_html_action(title:string, url:string, reply:boolean):string{
    // Return html for the action footer of a html invite
    return `
        <hr style='margin: 0; border-style: solid; border-color: #cccccc; border-width: 1px 0 0 0;'>

        <div style='padding: 12px; border-radius: 0 0 12px 12px; text-align: center;
                background-color: #ddeeff; color: #000000; font-family: Roboto, sans-serif;'>

            <h3 style='font-size: 1.2em;'>${html_escape(title)}</h3>

            <p style='margin: 36px 0;'>
                <a href='${html_escape(url)}' style='background-color: #224477; color: #ffffff;
                        padding: 12px 18px; border-radius: 12px; text-decoration: none;'>
                    <strong>Open ${reply ? "Reply" : "Message"}</strong>
                </a>
            </p>

        </div>
    `
}


interface TextInviteContext {
    contact:string
    sender:string
    title:string
    url:string
}


export function render_invite_text(template:string, {contact, sender, title, url}:TextInviteContext,
        ):string{
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
    const msg = await self.app_db.messages.get(copy.msg_id)
    const profile = await self.app_db.profiles.get(msg.draft.profile)

    // Account for inheritance
    const template = profile.msg_options_identity.invite_tmpl_clipboard
    const sender = msg.draft.options_identity.sender_name
        || profile.msg_options_identity.sender_name

    // Render invite
    return render_invite_text(template, {
        contact: copy.contact_hello,
        sender: sender,
        title: msg.draft.title,
        url: profile.view_url(copy.id, await export_key(copy.secret)),
    })
}

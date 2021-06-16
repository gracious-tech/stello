
import {escape as html_escape} from 'lodash'  // Avoid deprecated global `escape()`

import {MessageCopy} from '@/services/database/copies'
import {export_key} from '@/services/utils/crypt'
import {replace_without_overlap} from '@/services/utils/strings'


export const INVITE_HTML_CONTAINER_STYLES =
    'border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #cccccc;'


export function render_invite_html(contents:string, title:string, url:string):string{
    // Render a HTML invite template with the provided contents
    return `
        <!DOCTYPE html>
        <html>
            <head>
            </head>
            <body style='margin: 24px;'>
                <div style='${INVITE_HTML_CONTAINER_STYLES}'>
                    <div style='padding: 24px;'>
                        ${contents}
                    </div>
                    ${render_invite_html_action(title, url)}
                </div>
            </body>
        </html>
    `
}


export function render_invite_html_action(title:string, url:string):string{
    // Return html for the action footer of a html invite
    // NOTE <hr> used for some separation if css disabled
    return `
        <hr style='margin-bottom: 0; border-style: solid; border-color: #cccccc;
            border-width: 1px 0 0 0;'>

        <div style='padding: 12px; border-radius: 0 0 12px 12px; text-align: center;
                background-color: #ddeeff; color: #000000; font-family: Roboto, sans-serif;'>

            <h3 style='font-size: 1.2em;'>${html_escape(title)}</h3>

            <p style='margin: 36px 0;'>
                <a href='${html_escape(url)}' style='background-color: #224477; color: #ffffff;
                        padding: 12px 18px; border-radius: 12px; text-decoration: none;'>
                    <strong>Open Message</strong>
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
    const msg = await self._db.messages.get(copy.msg_id)
    const profile = await self._db.profiles.get(msg.draft.profile)

    // Account for inheritance
    const template = profile.msg_options_identity.invite_tmpl_clipboard  // TODO
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

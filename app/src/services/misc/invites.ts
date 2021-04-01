
import {escape as html_escape} from 'lodash'  // Avoid deprecated global `escape()`

import {MessageCopy} from '@/services/database/copies'
import {export_key} from '@/services/utils/crypt'
import {replace_without_overlap} from '@/services/utils/strings'


interface InviteContext {
    contact:string
    sender:string
    title:string
    url:string
}


export function render_invite_html(template:string, {contact, sender, title, url}:InviteContext,
        doc:boolean=true):string{
    // Render a HTML invite template with the provided context

    // Escape and replace placeholders
    let html = replace_without_overlap(template, {
        CONTACT: html_escape(contact),
        SENDER: html_escape(sender),
        SUBJECT: html_escape(title),
        LINK: '',  // Link placeholder removed post v0.1.1 (bad UX to have link and main button)
    })

    // Append title and url to end of template
    // NOTE <hr> used for some separation if css disabled
    html = `
        <div style='border-radius: 12px; max-width: 600px; margin: 0 auto; border:
                1px solid #cccccc;'>

            <div style='padding: 24px;'>
                ${html}
            </div>

            <hr style='margin-bottom: 0; border-style: solid; border-color: #cccccc;
                border-width: 1px 0 0 0;'>

            <div style='padding: 12px; border-radius: 0 0 12px 12px; text-align: center;
                    background-color: #ddeeff; color: #000000; font-family: Roboto, sans-serif;'>

                <h3 style='font-size: 1.2em;'>${html_escape(title)}</h3>

                <p style='margin: 36px 0;'>
                    <a href='${html_escape(url)}' style='background-color: #224477; color: #ffffff;
                            padding: 12px 18px; border-radius: 12px; text-decoration: none;'>
                        <strong>OPEN MESSAGE</strong>
                    </a>
                </p>

            </div>
        </div>
    `

    // Optionally return without structural html
    if (!doc){
        return html
    }

    // Add doc tags and styles for when not embedding in another page
    return `
        <!DOCTYPE html>
        <html>
            <head>
            </head>
            <body style='margin: 24px;'>
                ${html}
            </body>
        </html>
    `
}


export function render_invite_text(template:string, {contact, sender, title, url}:InviteContext,
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

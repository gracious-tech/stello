
import chroma from 'chroma-js'
import {escape as html_escape} from 'lodash'  // Avoid deprecated global `escape()`

import {MessageCopy} from '@/services/database/copies'
import {export_key} from '@/services/utils/crypt'
import {replace_without_overlap} from '@/services/utils/strings'
import {buffer_to_url64} from '@/services/utils/coding'


// Invite dimensions
export const INVITE_HTML_MAX_WIDTH = 600
export const INVITE_IMG_HEIGHT = INVITE_HTML_MAX_WIDTH / 3


export function gen_invite_styles(hue:number){
    // Generate styles for the different elements in a HTML invite

    // Get RGB hex values for hue (since Outlook can't understand anything else)
    // NOTE Sometimes still use rgba/hsla etc if can't do via hex and not super important
    // NOTE lightness exact middle to support both light/dark themes
    const bg_color = chroma.hsl(hue, 0.2, 0.5).hex()
    const button_color = chroma.hsl(hue, 0.8, 0.5).hex()

    // WARN Don't use 'em' as SpamAssassin thinks it's hiding words when less than 0 (e.g. 0.8em)
    // See https://github.com/apache/spamassassin/blob/d092a416336117b34ca49ef57be31b8c0b5b0422/rulesrc/sandbox/jhardin/20_misc_testing.cf#L2569
    return {
        container: `border-radius: 12px; max-width: ${INVITE_HTML_MAX_WIDTH}px; margin: 0 auto;`
            + 'background-color: rgba(127, 127, 127, 0.15);',
        // NOTE Some clients (e.g. Thunderbird) don't respect img aspect ratio, so max-height helps
        image: `border-radius: 12px 12px 0 0; width: 100%; height: auto;`
            + `background-color: ${bg_color}`
            + `border-bottom: 1px solid #888888; max-height: ${INVITE_IMG_HEIGHT}px;`,
        hr: `margin: 0; border-style: solid; border-color: #888888;`
            + `border-width: 1px 0 0 0;`,
        action: `border-radius: 0 0 12px 12px; padding: 36px 0; text-align: center;`
            + `background-color: ${bg_color};`,
        button: `padding: 12px 0; border-radius: 12px; text-decoration: none;`
            + `font-family: sans-serif; background-color: ${button_color};`,
    }
}


export function render_invite_html(contents:string, url:string, image:string, button:string,
        hue:number, encrypted_address?:string):string{
    // Render a HTML invite template with the provided contents
    // NOTE Header image must be wrapped in <a> to prevent gmail showing download button for it
    // NOTE Styles are inline so preserved when replying/forwarding
    // NOTE <hr> etc used for some separation if css disabled
    // NOTE Some styles must be directly on elements to not be overriden (e.g. color on <a>)
    // NOTE Outlook desktop is the worst client and some things (bg etc) don't work on it
    // WARN Must always test on Outlook desktop/iMail/Gmail/Thunderbird/etc whenever changed

    // Notes for action area
    // NOTE Button gets lighter colors in dark mode, but won't show up in app's previews
    // NOTE &nbsp; used instead of horizontal padding as Outlook doesn't support padding
    // NOTE mso-text-raise is used to add vertical padding for Outlook
    //      First nbsp is raised 20pt to add that much vertical space, actual text half to center

    // Generate styles
    const styles = gen_invite_styles(hue)

    // Generate HTML for subscription links if address provided
    let subscription_links = ''
    if (encrypted_address){
        const unsub_url = `${url},unsub,${encrypted_address}`
        const address_url = `${url},address,${encrypted_address}`
        subscription_links = `
            <hr style='border-style: none;'>
            <p>&nbsp;</p>
            <p style='text-align: center; color: #aaaaaa;'>
                <a href='${html_escape(unsub_url)}' style='color: #aaaaaa;'>
                    <small>Unsubscribe</small></a>
                |
                <a href='${html_escape(address_url)}' style='color: #aaaaaa;'>
                    <small>Change email address</small></a>
            </p>
        `
    }

    // NOTE meta color-scheme ensures Apple etc apply user's scheme rather than default to light
    return `
        <html>
        <head>
            <meta name='color-scheme' content='light dark'>
        </head>
        <body style='padding-top: 4px; padding-bottom: 150px;'>
            <div style='${styles.container}'>
                <a href='${html_escape(url)}'>
                    <img src='${html_escape(image)}' height='${INVITE_IMG_HEIGHT}'
                        width='${INVITE_HTML_MAX_WIDTH}' style='${styles.image}'>
                </a>
                <div style='padding: 16px;'>
                    ${contents}
                </div>
                <hr style='${styles.hr}'>
                <div style='${styles.action}'>
                    <a href='${html_escape(url)}' style='${styles.button}'>
                        <span style='mso-text-raise: 20pt;'>&nbsp;</span>
                        &nbsp;
                        <strong style='mso-text-raise: 10pt;'>${html_escape(button)}</strong>
                        &nbsp;&nbsp;
                    </a>
                </div>
            </div>
            ${subscription_links}
        </body>
        </html>
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


import {escape} from 'lodash'

import {Task} from './tasks'
import {Message} from './database/messages'
import {Profile} from './database/profiles'
import {MessageCopy} from './database/copies'
import {concurrent} from '@/services/utils/async'
import {resize_bitmap, blob_image_size} from '@/services/utils/image'
import {bitmap_to_canvas, canvas_to_blob, buffer_to_url64} from './utils/coding'
import {encrypt_sym, export_key} from './utils/crypt'
import {utf8_to_buffer} from './utils/coding'
import {SECTION_IMAGE_WIDTH} from './misc'
import {HostUser} from './hosts/types'
import {send_emails} from './native'
import type {PublishedCopyBase, PublishedAsset, PublishedCopy, PublishedSection,
    PublishedContentImages} from '@/shared/shared_types'
import type {RecordSection} from './database/types'


export class Sender {

    msg_id:string
    msg:Message
    task:Task
    profile:Profile
    host:HostUser

    constructor(msg_id:string){
        this.msg_id = msg_id
    }

    get lifespan(){
        // Return lifespan (accounting for inheritance)
        const value = this.msg.draft.options_security.lifespan
            ?? this.profile.msg_options_security.lifespan
        // WARN Ensure never exceed 365 if want to expire since no tag will match (for AWS)
        return value === Infinity ? null : Math.min(value, 365)
    }

    get max_reads(){
        // Return max_reads (accounting for inheritance)
        const value = this.msg.draft.options_security.max_reads
            ?? this.profile.msg_options_security.max_reads
        return value === Infinity ? null : value
    }

    async send(task:Task):Promise<string[]>{
        // Encrypt and upload assets and copies, and send email invites
        task.label = "Sending message"
        task.show_count = false  // Reveal later

        // Get the msg data
        this.msg = await self._db.messages.get(this.msg_id)

        // Get the profile and init storage client for the message
        this.profile = await self._db.profiles.get(this.msg.draft.profile)
        this.host = this.profile.new_host_user()

        // Process sections and produce assets
        const sections_data = await Promise.all(this.msg.draft.sections.map(
            async row => await Promise.all(row.map(sid => self._db.sections.get(sid)))))
        const [pub_sections, assets] = await process_sections(sections_data)

        // Encrypt and upload assets
        await concurrent(assets.map(asset => {
            return () => this._publish_asset(asset)
        }))

        // Produce message data
        const pub_copy_base:PublishedCopyBase = {
            title: this.msg.draft.title,
            published: this.msg.published,
            base_msg_id: this.msg_id,
            has_max_reads: this.max_reads !== null,
            sections: pub_sections,
            assets_key: buffer_to_url64(await export_key(this.msg.assets_key)),
        }

        // Upload copies
        // TODO Use RxJS to start queuing emails as soon as copy uploaded so two concurrent queues
        // TODO (although nodemailer needs to do it via its own pools...)
        const copies = await self._db.copies.list_for_msg(this.msg_id)
        await concurrent(copies.map(copy => {
            return () => this._publish_copy(copy, pub_copy_base)
        }))

        // Sent email invites and return errors if any
        return this._send_emails(copies)
    }

    async _publish_asset(asset:PublishedAsset){
        // Encrypt and upload the asset

        // Check if latest already uploaded
        if (this.msg.assets_uploaded[asset.id]){
            return
        }

        // Encrypt and upload
        const encrypted = await encrypt_sym(asset.data, this.msg.assets_key)
        await this.host.upload_file(`assets/${this.msg_id}/${asset.id}`, encrypted, this.lifespan,
            this.max_reads)

        // Mark as uploaded
        this.msg.assets_uploaded[asset.id] = true
        self._db.messages.set(this.msg)
    }

    async _publish_copy(copy:MessageCopy, pub_copy_base:PublishedCopyBase){
        // Encrypt and upload the copy

        // Check if latest already uploaded
        if (copy.uploaded_latest){
            return
        }

        // Package copy's data
        const pub_copy:PublishedCopy = {
            ...pub_copy_base,
        }

        // Encrypt and upload
        const binary = utf8_to_buffer(JSON.stringify(pub_copy))
        const encrypted = await encrypt_sym(binary, copy.secret)
        await this.host.upload_file(`copies/${copy.id}`, encrypted, this.lifespan, this.max_reads)

        // Mark as uploaded
        copy.uploaded = true
        copy.uploaded_latest = true
        self._db.copies.set(copy)
    }

    async _send_emails(copies:MessageCopy[]):Promise<string[]>{
        // Send emails for the contacts with email addresses

        // Filter out copies that have already been sent to
        // NOTE Don't filter out non-email addresses yet, until get latest contact data
        copies = copies.filter(copy => !copy.invited)

        // Update contact details for all copies (in case changed)
        // NOTE Important for allowing user to correct addresses without having to recreate message
        await Promise.all(copies.map(async copy => {
            const contact = await self._db.contacts.get(copy.contact_id)
            if (!contact){
                return  // Contact has since been deleted
            }
            copy.contact_name = contact.name
            copy.contact_hello = contact.name_hello_result
            copy.contact_address = contact.address
            self._db.copies.set(copy)
        }))

        // Filter out copies that don't have email addresses
        copies = copies.filter(copy => copy.contact_address_type === 'email')

        // Construct properties common to all emails
        const from = {
            name: this.msg.draft.options_identity.sender_name
                || this.profile.msg_options_identity.sender_name,
            address: this.profile.email,
        }
        const title = this.msg.draft.title
        const template = this.profile.msg_options_identity.invite_tmpl_email

        // Generate email objects from copies
        const emails = await Promise.all(copies.map(async copy => {
            return {
                to: {name: copy.contact_name, address: copy.contact_address},
                subject: title,
                html: render_invite_html(template, {
                    contact: copy.contact_hello,
                    sender: from.name,
                    title: title,
                    url: this.profile.view_url(copy.id, await export_key(copy.secret)),
                }),
            }
        }))

        // Determine if should prevent replies
        // NOTE Should only prevent email replies if Stello replies are allowed
        const no_reply = this.profile.options.smtp_no_reply && this.profile.options.allow_replies

        // Get native platform to send
        const errors = (await send_emails(this.profile.smtp_settings, emails, from, no_reply)).map(
            error => error && error.message)  // TODO Make use of other error properties

        // Update copies for successes
        // WARN Ensure copies still matches emails/errors in terms of item order etc
        for (let i = 0; i < copies.length; i++){
            if (errors[i] === null){
                copies[i].invited = true
                self._db.copies.set(copies[i])
            }
        }

        return errors
    }
}


async function process_sections(sections:RecordSection[][])
        :Promise<[PublishedSection[][], PublishedAsset[]]>{
    // Process sections and produce assets
    // WARN Avoid deep copying sections in case includes sensitive data (e.g. added in future)
    //      (also avoids duplicating blobs in memory)
    const pub_sections:PublishedSection[][] = []
    const pub_assets:PublishedAsset[] = []
    for (const row of sections){
        const pub_row = []
        for (const section of row){
            const [pub_section, pub_section_assets] = await process_section(section)
            pub_row.push(pub_section)
            pub_assets.push(...pub_section_assets)
        }
        pub_sections.push(pub_row)
    }
    return [pub_sections, pub_assets]
}


async function process_section(section:RecordSection):Promise<[PublishedSection, PublishedAsset[]]>{
    // Take section and produce publishable form and any assets required
    let pub_section:PublishedSection
    const pub_section_assets:PublishedAsset[] = []

    // Handle text
    if (section.content.type === 'text'){
        pub_section = {
            id: section.id,
            content: {
                type: 'text',
                html: section.content.html,
                standout: section.content.standout,
            },
        }

    // Handle images
    } else if (section.content.type === 'images'){

        // Work out max width/height for all images
        const max_width = SECTION_IMAGE_WIDTH
        // Determine max height from first image's dimensions
        const base_size = await blob_image_size(section.content.images[0].data)
        const base_ratio = base_size.width / base_size.height
        const max_height = max_width / base_ratio

        // Define and add section first, then add to its images array
        pub_section = {
            id: section.id,
            content: {
                type: 'images',
                images: [],
                ratio_width: base_size.width,  // May be smaller if resized (just for ratio)
                ratio_height: base_size.height,  // May be smaller if resized (just for ratio)
            },
        }

        // Create assets for each image and add references to published section data
        for (const image of section.content.images){

            // Resize the image
            let bitmap = await createImageBitmap(image.data)
            bitmap = await resize_bitmap(bitmap, max_width, max_height, section.content.crop)
            const bitmap_canvas = bitmap_to_canvas(bitmap)

            // Add assets
            pub_section_assets.push({
                id: image.id,
                data: await (await canvas_to_blob(bitmap_canvas)).arrayBuffer(),
            })
            /* SECURITY With admin access to storage you could know what assets are images by
                noting the patterns for webp/jpeg ids. But if you have admin access, there are
                far worse threats to make it negligable anyway.
            */
            const jpeg_id = `${image.id}j`
            pub_section_assets.push({
                id: jpeg_id,
                data: await (await canvas_to_blob(bitmap_canvas, 'jpeg')).arrayBuffer(),
            })

            // Add image to published section data
            ;(pub_section.content as PublishedContentImages).images.push({
                asset_webp: image.id,
                asset_jpeg: jpeg_id,
                caption: image.caption,
            })
        }
    }
    return [pub_section, pub_section_assets]
}


function replace_without_overlap(template:string, replacements:{[k:string]:string}):string{
    // Replace a series of values without replacing any values inserted from a previous replacement
    // e.g. if "SUBJECT" is replaced with "CONTACT ME", it will not match another key like "CONTACT"

    // First replace placeholders with versions with near zero probability of overlap
    for (const placeholder of Object.keys(replacements)){
        template = template.replaceAll(placeholder, `~~NEVER~~${placeholder}~~MATCH~~`)
    }

    // Now safe(r) to replace with actual values
    for (const [placeholder, value] of Object.entries(replacements)){
        template = template.replaceAll(`~~NEVER~~${placeholder}~~MATCH~~`, value)
    }

    return template
}


export function render_invite_html(template:string, {contact, sender, title, url}, doc=true):string{
    // Render a HTML invite template with the provided context

    // Escape and replace placeholders
    let html = replace_without_overlap(template, {
        CONTACT: escape(contact),
        SENDER: escape(sender),
        SUBJECT: escape(title),
        LINK: '',  // Link placeholder removed post v0.1.1 (bad UX to have link and main button)
    })

    // Append title and url to end of template
    // NOTE <hr> used for some separation if css disabled
    html = `
        <div class='message'>${html}</div>
        <hr>
        <div class='prompt'>
            <h3>${escape(title)}</h3>
            <p class='link'>
                <a href='${escape(url)}'>
                    <strong>OPEN MESSAGE</strong>
                </a>
            </p>
        </div>
    `

    // Optionally return without structural html
    if (!doc){
        return html
    }

    // Add doc tags and styles
    // NOTE Font size is slightly larger than user's default to standout since not much text
    return `
        <!DOCTYPE html>
        <html>
            <head>
                <style>

        body {margin: 24px; font-size: 1.1em;}
        .container {border-radius: 12px; max-width: 600px; margin: 0 auto;
            border: 1px solid #cccccc;}
        .message {padding: 24px;}
        hr {margin-bottom: 0; border-style: solid; border-color: #cccccc; border-width: 1px 0 0 0;}
        .prompt {padding: 12px; border-radius: 0 0 12px 12px; text-align: center;
            background-color: #ddeeff; color: #000000; font-family: Roboto, sans-serif;}
        h3 {font-size: 1.2em;}
        .link {margin: 36px 0;}
        .link a {background-color: #224477; color: #ffffff; padding: 12px 18px; border-radius: 12px;
            text-decoration: none;}

                </style>
            </head>
            <body>
                <div class='container'>${html}</div>
            </body>
        </html>
    `
}


export function render_invite_text(template:string, {contact, sender, title, url}):string{
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


export async function get_text_invite_for_copy(copy:MessageCopy){
    // Get text invite for copy (regardless of contact's address)

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

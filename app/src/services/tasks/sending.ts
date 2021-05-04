
import DialogEmailSettings from '@/components/dialogs/reuseable/DialogEmailSettings.vue'
import {Task} from './tasks'
import {Message} from '../database/messages'
import {Section} from '../database/sections'
import {Profile} from '../database/profiles'
import {MessageCopy} from '../database/copies'
import {concurrent} from '@/services/utils/async'
import {resize_bitmap, blob_image_size} from '@/services/utils/image'
import {bitmap_to_canvas, canvas_to_blob, buffer_to_url64} from '../utils/coding'
import {encrypt_sym, export_key} from '../utils/crypt'
import {string_to_utf8} from '../utils/coding'
import {SECTION_IMAGE_WIDTH} from '../misc'
import {HostUser} from '../hosts/types'
import {send_emails} from '../native/native'
import type {PublishedCopyBase, PublishedAsset, PublishedCopy, PublishedSection,
    PublishedContentImages} from '@/shared/shared_types'
import {render_invite_html} from '../misc/invites'
import {MustReauthenticate, MustReconfigure, MustReconnect} from '../utils/exceptions'
import {Email} from '../native/types'
import {send_emails_oauth} from './email'


export async function send_oauth_setup(task:Task):Promise<void>{
    // Setup oauth for email sending for given profile
    // NOTE Doesn't validate whether have correct scopes as can fix later if a send task fails
    const [oauth_id, profile_id] = task.params
    const oauth = await self._db.oauths.get(oauth_id)
    const profile = await self._db.profiles.get(profile_id)

    // Still set task label as will show briefly that task has been completed
    task.label = `Use ${oauth.email} to send emails`

    // Update email if needed
    // TODO Consider verifying with user if they intended this, as very easy to select wrong account
    if (profile.email !== oauth.email){
        profile.email = oauth.email
        profile.host_state.responder_config_uploaded = false
        // TODO Consider running upload configs as a post task, if email change
    }

    // Replace whole smtp object in case old settings exist
    profile.smtp = {
        oauth: oauth_id,
        user: '',
        pass: '',
        host: '',
        port: null,
        starttls: false,
    }

    // Set name if available and not set yet
    if (oauth.name && !profile.msg_options_identity.sender_name){
        profile.msg_options_identity.sender_name = oauth.name
    }

    // Save changes
    await self._db.profiles.set(profile)
}


export async function send_message(task:Task):Promise<void>{
    // Send a message
    await new Sender().send(task)
}


export class Sender {

    msg_id:string
    msg:Message
    task:Task
    profile:Profile
    host:HostUser

    async send(task:Task):Promise<void>{
        // Encrypt and upload assets and copies, and send email invites

        // Get the msg data
        this.msg_id = task.params[0]
        this.msg = await self._db.messages.get(this.msg_id)
        this.profile = await self._db.profiles.get(this.msg.draft.profile)

        // Setup task
        // TODO Add tracking of subtasks
        task.label = `Sending message "${this.msg.display}"`
        if (this.profile.smtp_settings.oauth){
            task.fix_oauth = this.profile.smtp_settings.oauth
        } else {
            // Fix by opening email settings dialog
            task.fix_settings = async () => {
                const fresh_profile = await self._db.profiles.get(this.profile.id)
                self._store.dispatch('show_dialog', {
                    component: DialogEmailSettings, props: {profile: fresh_profile},
                })
            }
            task.fix_auth = task.fix_settings
        }

        // Init storage client for the message
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
            has_max_reads: this.msg.safe_max_reads !== Infinity,
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

        // Sent email invites
        await this._send_emails(copies)
    }

    async _publish_asset(asset:PublishedAsset):Promise<void>{
        // Encrypt and upload the asset

        // Check if latest already uploaded
        if (this.msg.assets_uploaded[asset.id]){
            return
        }

        // Encrypt and upload
        const encrypted = await encrypt_sym(asset.data, this.msg.assets_key)
        await this.host.upload_file(`assets/${this.msg_id}/${asset.id}`, encrypted,
            this.msg.safe_lifespan_remaining, this.msg.safe_max_reads)

        // Mark as uploaded
        this.msg.assets_uploaded[asset.id] = true
        self._db.messages.set(this.msg)
    }

    async _publish_copy(copy:MessageCopy, pub_copy_base:PublishedCopyBase):Promise<void>{
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
        const binary = string_to_utf8(JSON.stringify(pub_copy))
        const encrypted = await encrypt_sym(binary, copy.secret)
        await this.host.upload_file(`copies/${copy.id}`, encrypted,
            this.msg.safe_lifespan_remaining, this.msg.safe_max_reads)

        // Mark as uploaded
        copy.uploaded = true
        copy.uploaded_latest = true
        self._db.copies.set(copy)
    }

    async _send_emails(copies:MessageCopy[]):Promise<void>{
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
        copies = copies.filter(copy => copy.contact_address)

        // Construct properties common to all emails
        const from = {
            name: this.msg.draft.options_identity.sender_name
                || this.profile.msg_options_identity.sender_name,
            address: this.profile.email,
        }
        const title = this.msg.draft.title
        const template = this.profile.msg_options_identity.invite_tmpl_email

        // Generate email objects from copies
        const emails:Email[] = await Promise.all(copies.map(async copy => {
            return {
                id: copy.id,  // Use copy's id for email id for matching later
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

        // Send using oauth or regular SMTP (SMTP requires native platform's help)
        const reply_to = this.profile.smtp_reply_to
        if (this.profile.smtp_settings.oauth){
            await send_emails_oauth(this.profile.smtp_settings.oauth, emails, from, reply_to)
        } else {
            const error = await send_emails(this.profile.smtp_settings, emails, from, reply_to)
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
    }
}


async function process_sections(sections:Section[][])
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


async function process_section(section:Section):Promise<[PublishedSection, PublishedAsset[]]>{
    // Take section and produce publishable form and any assets required
    let pub_section:PublishedSection
    const pub_section_assets:PublishedAsset[] = []

    // Handle text
    if (section.content.type === 'text'){
        pub_section = {
            id: section.id,
            respondable: section.respondable_final,
            content: {
                type: 'text',
                html: section.content.html,
                standout: section.content.standout,
            },
        }

    // Handle video
    } else if (section.content.type === 'video'){
        pub_section = {
            id: section.id,
            respondable: section.respondable_final,
            content: {...section.content},  // All props same and are primitives
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
            respondable: section.respondable_final,
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
            pub_section_assets.push({
                id: `${image.id}j`,  // Image id with 'j' appended
                data: await (await canvas_to_blob(bitmap_canvas, 'jpeg')).arrayBuffer(),
            })

            // Add image to published section data
            ;(pub_section.content as PublishedContentImages).images.push({
                id: image.id,
                caption: image.caption,
            })
        }
    }
    return [pub_section, pub_section_assets]
}


import {cloneDeep} from 'lodash'

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
import type {PublishedCopyBase, PublishedAsset, PublishedCopy, PublishedSection, PublishedImage,
    PublishedContentText} from '@/shared/shared_types'
import {render_invite_html} from '../misc/invites'
import {gen_variable_items, update_template_values, TemplateVariables, msg_max_reads_value,
    } from '../misc/templates'
import {MustReauthenticate, MustReconfigure, MustReconnect} from '../utils/exceptions'
import {Email} from '../native/types'
import {send_emails_oauth} from './email'
import {configs_update} from './configs'


export async function send_oauth_setup(task:Task):Promise<void>{
    // Setup oauth for email sending for given profile
    // NOTE Doesn't validate whether have correct scopes as can fix later if a send task fails
    const [oauth_id, profile_id] = task.params
    const oauth = await self._db.oauths.get(oauth_id)
    if (!oauth){
        throw task.abort("Credentials missing")
    }
    const profile = await self._db.profiles.get(profile_id)
    if (!profile){
        throw task.abort("Sending account no longer exists")
    }

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
    tmpl_variables:TemplateVariables

    get sender_name():string{
        // Get sender name, accounting for inheritance from profile
        return this.msg.draft.options_identity.sender_name
            || this.profile.msg_options_identity.sender_name
    }

    get invite_image():Promise<ArrayBuffer>{
        // Get invite image, accounting for inheritance from profile
        const default_image = this.msg.draft.reply_to
            ? this.profile.options.reply_invite_image
            : this.profile.msg_options_identity.invite_image
        return (this.msg.draft.options_identity.invite_image ?? default_image).arrayBuffer()
    }

    get invite_tmpl_email():string{
        // Get invite tmpl for email, accounting for inheritance from profile
        const default_tmpl = this.msg.draft.reply_to
            ? this.profile.options.reply_invite_tmpl_email
            : this.profile.msg_options_identity.invite_tmpl_email
        return this.msg.draft.options_identity.invite_tmpl_email || default_tmpl
    }

    async send(task:Task):Promise<void>{
        // Encrypt and upload assets and copies, and send email invites

        // Get the msg data
        this.msg_id = task.params[0]
        this.msg = await self._db.messages.get(this.msg_id)
        if (!this.msg){
            throw task.abort("Message no longer exists")
        }

        // Setup task
        // TODO Add tracking of subtasks
        task.abortable = true
        task.label = `Sending message "${this.msg.display}"`

        // Ensure configs are up-to-date
        await configs_update(new Task('configs_update', [this.msg.draft.profile], []))

        // Get the profile
        this.profile = await self._db.profiles.get(this.msg.draft.profile)
        if (!this.profile){
            throw task.abort("Sending account no longer exists")
        }

        // Provide fix options (will detect appropriate one to use in failure dialog)
        task.fix_oauth = this.profile.smtp_settings.oauth  // May be null which is fine
        task.fix_settings = async () => {
            const fresh_profile = await self._db.profiles.get(this.profile.id)
            if (fresh_profile){
                self._store.dispatch('show_dialog', {
                    component: DialogEmailSettings, props: {profile: fresh_profile},
                })
            } else {
                return "Sending account no longer exists"
            }
        }
        task.fix_auth = task.fix_settings

        // Init storage client for the message
        this.host = this.profile.new_host_user()

        // Generate values for dynamic content
        // NOTE Contact values set to null as will update per copy
        this.tmpl_variables = gen_variable_items(null, null, this.sender_name,
            this.msg.draft.title, this.msg.published, this.msg.max_reads, this.msg.lifespan)

        // Process sections and produce assets
        const sections_data = await Promise.all(this.msg.draft.sections.map(
            async row => await Promise.all(row.map(sid => self._db.sections.get(sid)))))
        const [pub_sections, assets] = await process_sections(sections_data, this.tmpl_variables)

        // Encrypt and upload assets
        await concurrent(assets.map(asset => {
            return () => this._publish_asset(asset)
        }))

        // Produce message data
        const pub_copy_base:PublishedCopyBase = {
            title: this.msg.draft.title,
            published: this.msg.published.toJSON(),
            base_msg_id: this.msg_id,
            sections: pub_sections,
            assets_key: buffer_to_url64(await export_key(this.msg.assets_key)),
        }

        // Get copies
        const copies = await this._get_copies()

        // Check if aborted before uploading copies
        task.check_aborted()

        // Upload copies
        // TODO Use RxJS to start queuing emails as soon as copy uploaded so two concurrent queues
        // TODO (although nodemailer needs to do it via its own pools...)
        await concurrent(copies.map(copy => {
            return async () => {
                await this._publish_copy(copy, pub_copy_base)
                task.check_aborted()
            }
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

    async _get_copies():Promise<MessageCopy[]>{
        // Get copies, filter out already sent/expired, and refresh their contact data
        let copies = await self._db.copies.list_for_msg(this.msg_id)

        // Nothing to do if expired OR already uploaded+sent
        copies = copies.filter(copy => !copy.expired && (!copy.uploaded_latest || !copy.invited))

        // Get latest contact data (as may have changed if resuming an unfinished send)
        // NOTE Important when fixing an incorrect email address
        // NOTE Contact may no longer exist
        for (const copy of copies){
            const contact = await self._db.contacts.get(copy.contact_id)
            if (contact){
                copy.contact_name = contact.name
                copy.contact_hello = contact.name_hello_result
                copy.contact_address = contact.address
                copy.contact_multiple = contact.multiple
                self._db.copies.set(copy)
            }
        }

        return copies
    }

    async _publish_copy(copy:MessageCopy, pub_copy_base:PublishedCopyBase):Promise<void>{
        // Encrypt and upload the copy

        // Check if latest already uploaded
        if (copy.uploaded_latest){
            return
        }

        // Determine max_reads, taking into account contact_multiple
        const max_reads = copy.contact_multiple ? Infinity : this.msg.safe_max_reads

        // Package copy's data
        const pub_copy:PublishedCopy = {
            ...pub_copy_base,
            has_max_reads: max_reads !== Infinity,
            permission_subscription: !copy.contact_multiple,
            contact_address: copy.contact_address,
            // Clone sections so can replace contact variables without affecting `pub_copy_base`
            sections: pub_copy_base.sections.map(srow => srow.map(section => {
                if (section.content.type !== 'text'){
                    return section  // No need to clone non-text sections, just pass original
                }
                const cloned = cloneDeep(section) as PublishedSection<PublishedContentText>
                // NOTE Not passing `empty` arg so that other variables are not touched
                cloned.content.html = update_template_values(cloned.content.html, {
                    contact_hello: {value: copy.contact_hello},
                    contact_name: {value: copy.contact_name},
                    msg_max_reads: {value: msg_max_reads_value(max_reads)},
                })
                return cloned
            })),
        }

        // Encrypt and upload
        const binary = string_to_utf8(JSON.stringify(pub_copy))
        const encrypted = await encrypt_sym(binary, copy.secret)
        await this.host.upload_file(`copies/${copy.id}`, encrypted,
            this.msg.safe_lifespan_remaining, max_reads)

        // Encrypt and upload invite image
        // NOTE Uploaded even if not sending by email (re-eval if non-email invites widely used)
        const encrypted_image = await encrypt_sym(await this.invite_image, copy.secret_sse)
        await this.host.upload_file(`invite_images/${copy.id}`, encrypted_image,
            this.msg.safe_lifespan_remaining)

        // Mark as uploaded
        copy.uploaded = true
        copy.uploaded_latest = true
        self._db.copies.set(copy)

        // Update store property so components can watch it for updates
        self._store.state.tmp.uploaded = copy
    }

    async _send_emails(copies:MessageCopy[]):Promise<void>{
        // Send emails for the contacts with email addresses

        // Filter out copies that aren't to be sent by email OR have already been sent to
        copies = copies.filter(copy => copy.contact_address && !copy.invited)

        // Construct properties common to all emails
        const from = {
            name: this.sender_name,
            address: this.profile.email,
        }
        const title = this.msg.draft.title

        // Do initial contact-ambigious replacement of template variables
        const template = update_template_values(this.invite_tmpl_email, this.tmpl_variables, '-')

        // Get responder url from deployment config
        const responder_url = (await this.host.download_deployment_config()).url_responder

        // Generate email objects from copies
        const emails:Email[] = await Promise.all(copies.map(async copy => {
            const max_reads = copy.contact_multiple ? Infinity : this.msg.safe_max_reads
            const contents = update_template_values(template, {
                contact_hello: {value: copy.contact_hello},
                contact_name: {value: copy.contact_name},
                msg_max_reads: {value: msg_max_reads_value(max_reads)},
            })
            const url = this.profile.view_url(copy.id, await export_key(copy.secret))
            const secret_sse_url64 = buffer_to_url64(await export_key(copy.secret_sse))
            const image = `${responder_url}?image=${copy.id}&k=${secret_sse_url64}`
            const address_buffer = string_to_utf8(JSON.stringify({address: copy.contact_address}))
            let encrypted_address:string
            if (!copy.contact_multiple){  // Don't show subscription links if multiple people
                encrypted_address = buffer_to_url64(await encrypt_sym(address_buffer,
                    this.profile.host_state.secret))
            }
            return {
                id: copy.id,  // Use copy's id for email id for matching later
                to: {name: copy.contact_name, address: copy.contact_address},
                subject: title,
                html: render_invite_html(contents, title, url, image, !!this.msg.draft.reply_to,
                    encrypted_address),
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


async function process_sections(sections:Section[][], tmpl_variables:TemplateVariables)
        :Promise<[PublishedSection[][], PublishedAsset[]]>{
    // Process sections and produce assets
    // WARN Avoid deep copying sections in case includes sensitive data (e.g. added in future)
    //      (also avoids duplicating blobs in memory)
    const pub_sections:PublishedSection[][] = []
    const pub_assets:PublishedAsset[] = []
    for (const row of sections){
        const pub_row = []
        for (const section of row){
            pub_row.push(await process_section(section, pub_assets, tmpl_variables))
        }
        pub_sections.push(pub_row)
    }
    return [pub_sections, pub_assets]
}


async function process_section(section:Section, pub_assets:PublishedAsset[],
        tmpl_variables:TemplateVariables):Promise<PublishedSection>{
    // Take section and produce publishable form and any assets required

    // Handle text
    if (section.content.type === 'text'){
        return {
            id: section.id,
            respondable: section.respondable_final,
            content: {
                type: 'text',
                html: update_template_values(section.content.html, tmpl_variables, '-'),
                standout: section.content.standout,
            },
        }

    // Handle video
    } else if (section.content.type === 'video'){
        return {
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

        // Create assets for each image and collect other metadata into an images array
        const images:PublishedImage[] = []
        for (const image of section.content.images){

            // Resize the image
            let bitmap = await createImageBitmap(image.data)
            bitmap = await resize_bitmap(bitmap, max_width, max_height, section.content.crop)
            const bitmap_canvas = bitmap_to_canvas(bitmap)

            // Add assets
            pub_assets.push({
                id: image.id,
                data: await (await canvas_to_blob(bitmap_canvas)).arrayBuffer(),
            })
            /* SECURITY With admin access to storage you could know what assets are images by
                noting the patterns for webp/jpeg ids. But if you have admin access, there are
                far worse threats to make it negligable anyway.
            */
            pub_assets.push({
                id: `${image.id}j`,  // Image id with 'j' appended
                data: await (await canvas_to_blob(bitmap_canvas, 'jpeg')).arrayBuffer(),
            })

            // Add image metadata
            images.push({
                id: image.id,
                caption: image.caption,
            })
        }

        return {
            id: section.id,
            respondable: section.respondable_final,
            content: {
                type: 'images',
                images: images,
                ratio_width: base_size.width,  // May be smaller if resized (just for ratio)
                ratio_height: base_size.height,  // May be smaller if resized (just for ratio)
            },
        }
    }

    throw new Error("Impossible")
}

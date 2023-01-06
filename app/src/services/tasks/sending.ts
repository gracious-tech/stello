
import {cloneDeep} from 'lodash'

import DialogEmailSettings from '@/components/dialogs/reuseable/DialogEmailSettings.vue'
import {Task} from './tasks'
import {Message} from '../database/messages'
import {Profile} from '../database/profiles'
import {MessageCopy} from '../database/copies'
import {concurrent} from '@/services/utils/async'
import {email_address_like} from '@/services/utils/misc'
import {resize_bitmap, blob_image_size} from '@/services/utils/image'
import {bitmap_to_bitcanvas, blob_to_bitmap, canvas_to_blob, buffer_to_url64, string_to_utf8}
    from '../utils/coding'
import {encrypt_sym, export_key, generate_token} from '../utils/crypt'
import {SECTION_IMAGE_WIDTH} from '../misc'
import {HostUser} from '../hosts/types'
import type {PublishedCopyBase, PublishedAsset, PublishedCopy, PublishedSection, PublishedImage,
    PublishedContentText} from '@/shared/shared_types'
import {render_invite_html} from '../misc/invites'
import {zip} from '@/services/misc/zip'
import {gen_variable_items, update_template_values, TemplateVariables, msg_max_reads_value}
    from '../misc/templates'
import {EmailTask, new_email_task} from '../email/email'
import {configs_update} from './configs'
import {hosts_storage_update} from '@/services/tasks/hosts'
import {SectionIds} from '@/services/database/types'


export async function send_oauth_setup(task:Task):Promise<void>{
    // Setup oauth for email sending for given profile
    // NOTE Doesn't validate whether have correct scopes as can fix later if a send task fails
    const [oauth_id, profile_id] = task.params as [string, string]
    const oauth = await self.app_db.oauths.get(oauth_id)
    if (!oauth){
        throw task.abort("Credentials missing")
    }
    const profile = await self.app_db.profiles.get(profile_id)
    if (!profile){
        throw task.abort("Sending account no longer exists")
    }

    // Still set task label as will show briefly that task has been completed
    task.label = `Use ${oauth.email} to send emails`

    // Update email if it changed
    if (profile.email !== oauth.email){
        profile.email = oauth.email
        profile.host_state.responder_config_uploaded = false
        // TODO Consider running upload configs as a post task, if email change
    }

    // Replace whole smtp object in case old settings exist
    profile.smtp = {
        oauth: oauth_id,
        user: '',
        pass: null,
        host: '',
        port: null,
        starttls: false,
    }

    // Set name if available and not set yet
    if (oauth.name && !profile.msg_options_identity.sender_name){
        profile.msg_options_identity.sender_name = oauth.name
    }

    // Confirm works
    try {
        await new_email_task(profile.smtp_settings).send({
            id: 'none',
            from: {name: '', address: profile.email},
            to: {name: '', address: 'blackhole@gracious.tech'},
            subject: "Confirm can send",
            html: "<p>Confirm can send</p>",
        })
    } catch (error){
        console.warn(error)
        throw task.abort("Connected account cannot send email")
    }

    // Save changes
    await self.app_db.profiles.set(profile)
}


export async function send_message(task:Task):Promise<void>{
    // Send a message
    await new Sender().send(task)
}


export class Sender {

    // Init'd via send method
    msg_id!:string
    msg!:Message
    profile!:Profile
    host!:HostUser
    tmpl_variables!:TemplateVariables
    email_client!:EmailTask
    shared_secret_64!:string

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

    get invite_button():string{
        // Get invite button text, accounting for inheritance from profile
        const default_button = this.msg.draft.reply_to
            ? this.profile.options.reply_invite_button
            : this.profile.msg_options_identity.invite_button
        // WARN Value will be '' to inherit so must use `||` and not `??`
        return this.msg.draft.options_identity.invite_button || default_button
    }

    get invite_tmpl_email():string{
        // Get invite tmpl for email, accounting for inheritance from profile
        const default_tmpl = this.msg.draft.reply_to
            ? this.profile.options.reply_invite_tmpl_email
            : this.profile.msg_options_identity.invite_tmpl_email
        // NOTE reply_invite_tmpl_email may be undefined due to unknown bug, so fallback to ''
        return (this.msg.draft.options_identity.invite_tmpl_email || default_tmpl) ?? ''
    }

    async send(task:Task):Promise<void>{
        // Encrypt and upload assets and copies, and send email invites

        // Get the msg data
        this.msg_id = task.params[0] as string
        this.msg = await self.app_db.messages.get(this.msg_id) as Message
        if (!this.msg){
            throw task.abort("Message no longer exists")
        }

        // Setup task
        task.abortable = true
        task.label = `Sending message "${this.msg.display}"`

        // Get the profile
        this.profile = await self.app_db.profiles.get(this.msg.draft.profile) as Profile
        if (!this.profile){
            throw task.abort("Sending account no longer exists")
        }

        // Ensure services are up-to-date
        if (this.profile.host_needs_update){
            await hosts_storage_update(
                new Task('hosts_storage_update', [this.msg.draft.profile], []))
        }

        // Ensure configs are up-to-date
        if (this.profile.configs_need_uploading){
            await configs_update(new Task('configs_update', [this.msg.draft.profile], []))
        }

        // Provide fix options (will detect appropriate one to use in failure dialog)
        task.fix_oauth = this.profile.smtp.oauth  // May be null which is fine
        task.fix_settings = async () => {
            const fresh_profile = await self.app_db.profiles.get(this.profile.id)
            if (fresh_profile){
                void self.app_store.dispatch('show_dialog', {
                    component: DialogEmailSettings, props: {profile: fresh_profile},
                })
            } else {
                return "Sending account no longer exists"
            }
            return undefined
        }
        task.fix_auth = task.fix_settings

        // Init storage client for the message
        this.host = await self.app_db.new_host_user(this.profile)

        // Generate values for dynamic content
        // NOTE Contact values set to null as will update per copy
        this.tmpl_variables = gen_variable_items(null, null, this.sender_name,
            this.msg.draft.title, this.msg.published, this.msg.max_reads, this.msg.lifespan)

        // Process sections and produce assets
        const pub_assets:PublishedAsset[] = []
        const pub_sections =
            await process_sections(pub_assets, this.msg.draft.sections, this.tmpl_variables)

        // Encrypt and upload assets
        await concurrent(pub_assets.map(asset => {
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
        task.upcoming(copies.length)
        task.show_count = true

        // Check if aborted before uploading copies
        task.check_aborted()

        // Encode shared secret for use in URLs
        this.shared_secret_64 = buffer_to_url64(
            await export_key(this.profile.host_state.shared_secret))

        // Init email sender
        this.email_client = new_email_task(await this.profile.get_authed_smtp_settings())
        const email_promises:Promise<unknown>[] = []

        // Upload copies
        await concurrent(copies.map(copy => {
            return async () => {
                task.check_aborted()
                await this._publish_copy(copy, pub_copy_base)
                task.check_aborted()
                // Don't await email send so doesn't hold up S3 uploads
                // WARN Careful modifying, as has been setup to avoid uncaught rejection issues
                // NOTE Catches errors and converts to return value to avoid uncaught complaints
                email_promises.push(task.expected(this._send_email(copy).then(() => {
                    // Since not awaited, not affected by abort throws, so check manually
                    if (task.aborted){
                        this.email_client.abort()
                    }
                }).catch((error:unknown) => error)))
            }
        }))

        // Wait for email sends to complete and throw if any errors
        for (const error of await Promise.all(email_promises)){
            if (error){
                throw error
            }
        }
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
        void self.app_db.messages.set(this.msg)
    }

    async _get_copies():Promise<MessageCopy[]>{
        // Get copies, filter out already sent/expired, and refresh their contact data
        let copies = await self.app_db.copies.list_for_msg(this.msg_id)

        // Nothing to do if expired OR already uploaded+sent
        copies = copies.filter(copy => !copy.expired && (!copy.uploaded_latest || !copy.invited))

        // Get latest contact data (as may have changed if resuming an unfinished send)
        // NOTE Important when fixing an incorrect email address
        // NOTE Contact may no longer exist
        for (const copy of copies){
            const contact = await self.app_db.contacts.get(copy.contact_id)
            if (contact){
                copy.contact_name = contact.name
                copy.contact_hello = contact.name_hello_result
                copy.contact_address = contact.address
                copy.contact_multiple = contact.multiple
                void self.app_db.copies.set(copy)
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
            })) as OneOrTwo<PublishedSection>[],
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
        void self.app_db.copies.set(copy)

        // Update store property so components can watch it for updates
        self.app_store.state.tmp.uploaded = copy
    }

    async _send_email(copy:MessageCopy):Promise<void>{
        // Send email for contact (if they have an email address)

        // If contact has no email address, or has already been emailed, skip
        if (!copy.contact_address || copy.invited){
            return
        }

        // Only attempt send if at least has some possibility of being an email address
        //      SMTP errors are very hard to catch & a single bad address can interrupt all sending
        //      Some users import contacts incorrectly, so avoid confusion with basic validation
        let accepted = false
        if (email_address_like(copy.contact_address.trim())){

            // Generate data needed for the email
            const max_reads = copy.contact_multiple ? Infinity : this.msg.safe_max_reads
            const contents = update_template_values(this.invite_tmpl_email, {
                ...this.tmpl_variables,
                contact_hello: {value: copy.contact_hello},
                contact_name: {value: copy.contact_name},
                msg_max_reads: {value: msg_max_reads_value(max_reads)},
            }, '-')
            const url = this.profile.view_url(this.shared_secret_64, copy.id,
                await export_key(copy.secret))
            const secret_sse_url64 = buffer_to_url64(await export_key(copy.secret_sse))
            const image = `${this.profile.api}inviter/image?user=${this.profile.user}`
                + `&copy=${copy.id}&k=${secret_sse_url64}`
            const address_buffer = string_to_utf8(JSON.stringify({address: copy.contact_address}))
            let encrypted_address:string|undefined = undefined
            if (!copy.contact_multiple){  // Don't show subscription links if multiple people
                encrypted_address = buffer_to_url64(await encrypt_sym(address_buffer,
                    this.profile.host_state.secret))
            }

            // Send using oauth or regular SMTP (SMTP requires native platform's help)
            accepted = await this.email_client.send({
                id: copy.id,  // Use copy's id for email id for matching later
                to: {name: copy.contact_name, address: copy.contact_address},
                from: {name: this.sender_name, address: this.profile.email},
                reply_to: this.profile.smtp_reply_to,
                subject: this.msg.draft.title,
                html: render_invite_html(contents, url, image, this.invite_button,
                    this.profile.options.theme_color.h, encrypted_address),
            })
        }

        // Update copy
        copy.invited = accepted
        void self.app_db.copies.set(copy)

        // Emit event so sending task can be tracked more closely in UI
        // NOTE A little hacky, but currently emitting via watching a store prop
        self.app_store.state.tmp.invited = copy
    }
}


async function process_sections(pub_assets:PublishedAsset[], sections:SectionIds,
        tmpl_variables:TemplateVariables){
    // Process sections and produce assets
    // NOTE Sections with empty content (like images/video) will be excluded when published
    const pub_sections:OneOrTwo<PublishedSection>[] = []
    for (const row of sections){
        const pub_row:PublishedSection[] = []
        for (const section of row){
            const pub_section = await process_section(section, pub_assets, tmpl_variables)
            if (pub_section){
                pub_row.push(pub_section)
            }
        }
        if (pub_row.length){
            pub_sections.push(pub_row as OneOrTwo<PublishedSection>)
        }
    }
    return pub_sections
}


async function process_section(section_id:string, pub_assets:PublishedAsset[],
        tmpl_variables:TemplateVariables):Promise<PublishedSection|null>{
    // Take section and produce publishable form and any assets required
    // WARN Avoid deep copying sections in case includes sensitive data (e.g. added in future)
    //      (also avoids duplicating blobs in memory)
    const section = await self.app_db.sections.get(section_id)
    if (!section){
        self.app_report_error("Section data missing (process_section)")
        return null
    }
    const content = section.content  // Commonly accessed

    // Handle page
    if (content.type === 'page'){
        if (content.image){
            // Pagebait width/height is dynamic but does have approximate limits
            // Given maximums are based on expected use and slight chance of very minor mistarget
            await process_image(pub_assets, section.id, content.image, 500*2, 300*2, true)
        }
        return {
            id: section.id,
            respondable: false,
            content: {
                type: 'page',
                button: content.button,
                headline: content.headline,
                desc: content.desc,
                image: content.image ? section.id : null,
                sections:
                    await process_sections(pub_assets, content.sections, tmpl_variables),
            },
        }

    // Handle text
    } else if (content.type === 'text'){
        return {
            id: section.id,
            respondable: section.respondable_final,
            content: {
                type: 'text',
                html: update_template_values(content.html, tmpl_variables, '-'),
                standout: content.standout,
            },
        }

    // Handle video
    } else if (content.type === 'video'){
        if (!content.format || !content.id){
            return null
        }
        return {
            id: section.id,
            respondable: section.respondable_final,
            content: {
                type: 'video',
                format: content.format,
                id: content.id,
                caption: content.caption,
                start: content.start,
                end: content.end,
            },
        }

    // Handle chart
    } else if (content.type === 'chart'){
        if (!content.data.length){
            return null
        }
        return {
            id: section.id,
            respondable: section.respondable_final,
            content: {
                type: 'chart',
                chart: content.chart,
                data: content.data.map(({label, number, hue}) => ({label, number, hue})),
                threshold: content.threshold,
                title: content.title,
                caption: content.caption,
            },
        }

    // Handle images
    } else if (content.type === 'images'){

        // Exclude if no images
        if (!content.images.length){
            return null
        }

        // Work out max width/height for all images
        const max_width = SECTION_IMAGE_WIDTH
        // Determine max height from first image's dimensions
        const base_size = await blob_image_size(content.images[0]!.data)
        const base_ratio = base_size.width / base_size.height
        const max_height = max_width / base_ratio

        // Create assets for each image and collect other metadata into an images array
        const images:PublishedImage[] = []
        for (const image of content.images){
            await process_image(pub_assets, image.id, image.data, max_width, max_height,
                content.crop)
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
                hero: section.is_hero,  // Providing 'is_hero' rather than just hero option value
            },
        }

    // Handle files
    } else if (content.type === 'files'){

        // Exclude if no files
        if (!content.files.length){
            return null
        }

        // Get the data and file properties
        let data:ArrayBuffer
        let filename:string
        let mimetype:string
        if (content.files.length === 1){
            data = await content.files[0]!.data.arrayBuffer()
            filename = content.files[0]!.name + content.files[0]!.ext
            mimetype = content.files[0]!.data.type
        } else {
            // Multiple files so need to combine into a zip
            const ziper = new zip.ZipWriter(new zip.Uint8ArrayWriter())
            const taken:string[] = []
            for (const file of content.files){
                const token = taken.includes(file.name + file.ext) ? ' ' + generate_token() : ''
                await ziper.add(file.name + token + file.ext, new zip.BlobReader(file.data))
                taken.push(file.name + file.ext)
            }
            data = (await ziper.close() as Uint8Array).buffer
            filename = content.label + '.zip'
            mimetype = 'application/zip'
        }

        // Add file data to published assets
        pub_assets.push({
            id: section.id,
            data,
        })

        return {
            id: section.id,
            respondable: section.respondable_final,
            content: {
                type: 'files',
                filename,
                mimetype,
                label: content.label,
                download: section.files_download!,
            },
        }
    }

    throw new Error("Impossible")
}


async function process_image(pub_assets:PublishedAsset[], id:string, image:Blob, max_width:number,
        max_height:number, crop:boolean){
    // Compress image and add to pub_assets

    // Resize the image
    let bitmap = await blob_to_bitmap(image)
    bitmap = await resize_bitmap(bitmap, max_width, max_height, crop)
    const bitcanvas = bitmap_to_bitcanvas(bitmap)  // bitmap_to_blob uses canvas anyway, save mem

    // Add assets
    pub_assets.push({
        id: id,
        data: await (await canvas_to_blob(bitcanvas, 'webp')).arrayBuffer(),
    })
    /* SECURITY With admin access to storage you could know what assets are images by
        noting the patterns for webp/jpeg ids. But if you have admin access, there are
        far worse threats to make it negligable anyway.
    */
    pub_assets.push({
        id: `${id}j`,  // Image id with 'j' appended
        data: await (await canvas_to_blob(bitcanvas, 'jpeg')).arrayBuffer(),
    })
}


import {sample} from 'lodash'
import {openDB} from 'idb/with-async-ittr.js'

import {AppDatabaseSchema, AppDatabaseConnection, RecordReplaction, RecordSectionContent,
    RecordDraft, ContentImages} from './types'
import {DatabaseState} from './state'
import {DatabaseContacts} from './contacts'
import {DatabaseGroups} from './groups'
import {DatabaseOAuths} from './oauths'
import {DatabaseProfiles} from './profiles'
import {DatabaseDrafts, Draft} from './drafts'
import {DatabaseMessages, Message} from './messages'
import {DatabaseCopies, MessageCopy} from './copies'
import {DatabaseSections, Section} from './sections'
import {DatabaseReads, Read} from './reads'
import {DatabaseReplies, Reply} from './replies'
import {DatabaseReactions, Reaction} from './reactions'
import {export_key, generate_hash, generate_token} from '../utils/crypt'
import {generate_key_sym} from '../utils/crypt'
import {buffer_to_url64} from '../utils/coding'
import {cycle, percent, range} from '../utils/iteration'
import {remove_item} from '../utils/arrays'
import {escape_for_html} from '../utils/strings'
import {migrate, DATABASE_VERSION} from './migrations'


export function open_db():Promise<AppDatabaseConnection>{
    // Get access to db (and create/upgrade if needed)
    return openDB<AppDatabaseSchema>('main', DATABASE_VERSION, {
        async upgrade(db, old_version, new_version, transaction){
            migrate(transaction, old_version)
        },
    })
}


export class Database {

    _conn:AppDatabaseConnection
    state:DatabaseState
    contacts:DatabaseContacts
    groups:DatabaseGroups
    oauths:DatabaseOAuths
    profiles:DatabaseProfiles
    drafts:DatabaseDrafts
    messages:DatabaseMessages
    copies:DatabaseCopies
    sections:DatabaseSections
    reads:DatabaseReads
    replies:DatabaseReplies
    reactions:DatabaseReactions

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
        this.state = new DatabaseState(connection)
        this.contacts = new DatabaseContacts(connection)
        this.groups = new DatabaseGroups(connection)
        this.oauths = new DatabaseOAuths(connection)
        this.profiles = new DatabaseProfiles(connection)
        this.drafts = new DatabaseDrafts(connection)
        this.messages = new DatabaseMessages(connection)
        this.copies = new DatabaseCopies(connection)
        this.sections = new DatabaseSections(connection)
        this.reads = new DatabaseReads(connection)
        this.replies = new DatabaseReplies(connection)
        this.reactions = new DatabaseReactions(connection)
    }


    // ADVANCED
    // Methods that interact with multiple stores or require custom transaction handling
    // NOTE Transactions are only necessary for the writes of a method, not the reads


    async draft_copy(draft_or_id:Draft|string, template?:boolean):Promise<Draft>{
        // Create a new draft from existing one, identified by id or object (can be from a msg too)

        // Get the original
        let original:Draft
        if (draft_or_id instanceof Draft){
            original = draft_or_id
        } else {
            original = await this.drafts.get(draft_or_id)
        }

        // Generate the copy initally as a new draft
        const copy = await this.drafts.create_object()

        // Only copy fields known to be safe to copy
        const safe_fields = ['reply_to', 'title', 'profile', 'options_identity', 'options_security',
            'recipients']
        for (const key of safe_fields){
            copy[key] = original[key]
        }

        // Override template property, else use existing
        copy.template = template ?? original.template

        // Also copy sections, but need to create copies of each's record too
        // NOTE The original's sections returned are used as-is with just the id changed
        // WARN It's assumed all properties (except id) of sections is copyable
        const section_records = await this.sections.get_multiple(original.sections.flat())
        copy.sections = original.sections.map(row => {
            return row.map(old_section_id => {
                const section = section_records.shift()  // Take next section out of array
                section.id = generate_token()  // Change id of the section
                this.sections.set(section)  // Save to db under the new id
                return section.id  // Replace old id in the sections nested array
            })
        }) as ([string]|[string, string])[]

        // Save the copy to the database and return
        this.drafts.set(copy)
        return copy
    }


    async draft_section_create(draft:Draft, type:string, position:number):Promise<void>{
        // Add a new section to a draft
        let content:RecordSectionContent

        // Content will vary by type
        if (type === 'text'){
            content = {
                type,
                standout: null,
                html: '',
            }
            // If the first section, auto-add title as a heading if it exists
            if (!draft.sections.length && draft.title.trim()){
                content.html = `<h1>${escape_for_html(draft.title)}</h1>`
            }
        } else if (type === 'images'){
            content = {
                type,
                images: [],
                crop: true,
            }
        } else if (type === 'video'){
            content = {
                type,
                format: null,
                id: null,
                start: null,
                end: null,
            }
        } else {
            throw new Error('invalid_type')
        }

        // Create the section and then add it (in correct position) to draft in a new row
        const section = await this.sections.create(content)
        draft.sections.splice(position, 0, [section.id])
        await this.drafts.set(draft)
    }

    async draft_section_remove(draft:Draft, section:Section):Promise<void>{
        // Remove a section from a draft
        draft.sections = draft.sections.filter(row => {
            remove_item(row, section.id)  // Remove from inner array if exists (row is a ref)
            return row.length  // Keep row if still has a section
        })
        await Promise.all([
            this.drafts.set(draft),
            this.sections.remove(section.id),
        ])
    }

    async draft_to_message(draft_id:string):Promise<Message>{
        // Publish a draft, converting it to a Message

        // Get the draft and profile
        const draft = await this.drafts.get(draft_id)
        const profile = await this.profiles.get(draft.profile)

        // Determine expiration values, accounting for inheritance
        const lifespan = draft.options_security.lifespan ?? profile.msg_options_security.lifespan
        const max_reads = draft.options_security.max_reads ?? profile.msg_options_security.max_reads

        // Create the message object
        const message = new Message({
            id: generate_token(),
            published: new Date(),
            expired: false,
            draft: draft,
            assets_key: await generate_key_sym(true),
            assets_uploaded: {},
            lifespan,
            max_reads,
        })

        // Create copy objects for the recipients
        const recipients = draft.get_final_recipients(await this.groups.list())
        const copies = await Promise.all(recipients.map(async contact_id => {

            // Get the contact's data
            const contact = await this.contacts.get(contact_id)

            // Generate secret and derive response token from it
            // NOTE Response token is derived from secret in case message has expired
            // NOTE Response token always kept in url64 so quicker for comparison
            // SECURITY No salt necessary since secret is random and one-time use
            const secret = await generate_key_sym(true)
            const resp_token = buffer_to_url64(await generate_hash(await export_key(secret)))

            // Construct and return the instance for this copy
            return new MessageCopy({
                id: generate_token(),
                msg_id: message.id,
                secret: secret,
                resp_token: resp_token,
                uploaded: false,
                uploaded_latest: false,
                invited: false,
                expired: false,
                contact_id: contact.id,
                contact_name: contact.name,
                contact_hello: contact.name_hello_result,
                contact_address: contact.address,
            })
        }))

        // Update replaction's `replied` property (if `reply_to` set)
        // NOTE Not part of transaction since not a critical part of message publishing
        if (draft.reply_to){
            const replaction = await this.replies.get(draft.reply_to)
                || await this.reactions.get(draft.reply_to)
            if (replaction && !replaction.replied){
                replaction.replied = true
                this[replaction.is_reply ? 'replies' : 'reactions'].set(replaction)
            }
        }

        // Start transaction (now that all non-db async stuff is done)
        const transaction = this._conn.transaction(['drafts', 'messages', 'copies'], 'readwrite')
        const store_drafts = transaction.objectStore('drafts')
        const store_messages = transaction.objectStore('messages')
        const store_copies = transaction.objectStore('copies')

        // Add the new objects
        store_messages.add(message)
        for (const copy of copies){
            store_copies.add(copy)
        }

        // Delete the original draft
        store_drafts.delete(draft.id)

        // Wait till done and then return message
        await transaction.done
        return message
    }

    draft_recipients_descriptor():(draft:RecordDraft)=>Promise<string>{
        // Returns a fn for getting as useful a desc of recipients as possible
        // NOTE Caches group and contact names so can reuse for multiple drafts more efficiently

        const group_names = {}
        const contact_names = {}

        return async (draft:Draft):Promise<string> => {
            // Unpack recipient arrays
            const {include_groups, exclude_groups, include_contacts, exclude_contacts} =
                draft.recipients

            // Collect known names
            const names = []
            if (include_groups.length){
                // There's groups, and unlikely many, so list them all
                for (const group_id of include_groups){
                    // If group not within group_names then haven't attempted to load yet
                    if (! (group_id in group_names)){
                        const group = await this.groups.get(group_id)
                        group_names[group_id] = group?.name ?? null
                    }
                    // If group's name isn't null (no longer exists) then add to the list
                    if (group_names[group_id]){
                        names.push(group_names[group_id])
                    }
                }
            } else {
                // There's only contacts, so list a few
                for (const contact_id of include_contacts.slice(0, 3)){
                    // If contact not within contact_names then haven't attempted to load yet
                    if (! (contact_id in contact_names)){
                        const contact = await this.contacts.get(contact_id)
                        contact_names[contact_id] = contact?.name ?? null
                    }
                    // If contact's name isn't null (no longer exists) then add to the list
                    if (contact_names[contact_id]){
                        names.push(contact_names[contact_id])
                    }
                }
            }

            // See if there's more to the story than detected names, and show ... if so
            const num_possible = include_groups.length + include_contacts.length
            if (num_possible > names.length || exclude_groups.length || exclude_contacts.length){
                if (!names.length){
                    // No names were able to be gotten so add numbers instead
                    names.push(include_groups.length ? `${include_groups.length} groups`
                        : `${include_contacts.length} contacts`)
                }
                names.push('...')
            }

            return names.join(', ')
        }
    }

    async read_create(sent:Date, resp_token:string, ip:string, user_agent:string):Promise<Read>{
        // Create a new read

        // Try to get msg copy identified by resp_token (if valid and copy not deleted yet)
        const msg_copy = await this.copies.get_by_resp_token(resp_token)
        if (!msg_copy){
            // Reads useless without valid resp_token as can't know if msg was actually decrypted
            return null
        }

        const read = new Read({
            id: generate_token(),
            sent: sent,
            ip: ip,
            user_agent: user_agent,
            copy_id: msg_copy.id,
            msg_id: msg_copy.msg_id,
        })
        await this._conn.add('reads', read)
        return read
    }

    async _gen_replaction(content:string, sent:Date, resp_token:string, section_id:string,
            subsection_id:string|null, ip:string, user_agent:string):Promise<RecordReplaction>{
        // Generate a replaction object that can be used for a reply or reaction

        // Construct new object with data already known
        const replaction:RecordReplaction = {
            id: generate_token(),
            sent: sent,
            ip: ip,
            user_agent: user_agent,
            copy_id: null,
            msg_id: null,
            msg_title: null,
            contact_id: null,
            contact_name: null,
            section_id: section_id,
            section_num: null,
            section_type: null,
            subsection_id: subsection_id,
            content: content,
            read: false,
            replied: false,
            archived: false,
        }

        // Try to get msg copy identified by resp_token (if valid and copy not deleted yet)
        // NOTE If copy still exists, so does msg and sections
        const msg_copy = await this.copies.get_by_resp_token(resp_token)
        if (msg_copy){
            // Set fields knowable from copy object
            replaction.copy_id = msg_copy.id
            replaction.msg_id = msg_copy.msg_id
            replaction.contact_id = msg_copy.contact_id
            replaction.contact_name = msg_copy.contact_name

            // Get msg so can know title
            const msg = await this.messages.get(msg_copy.msg_id)
            replaction.msg_title = msg.draft.title

            // If section id given then can determine its position and type
            if (section_id){
                // Record position as order of flat sections (ignoring rows)
                replaction.section_num = msg.draft.sections.flat().indexOf(section_id)

                // Get section object so can know the type
                const section = await self._db.sections.get(section_id)
                if (section){
                    replaction.section_type = section.content.type
                }
            }
        }

        return replaction
    }

    async reaction_create(content:string|null, sent:Date, resp_token:string, section_id:string,
            subsection_id:string|null, ip:string, user_agent:string):Promise<Reaction>{
        // Create a new reaction
        const reaction = new Reaction(
            await this._gen_replaction(content, sent, resp_token, section_id, subsection_id, ip,
                user_agent))

        // Delete any previous reactions for same contact & section
        // TODO Could improve performance by indexing on copy_id instead of contact_id
        if (reaction.contact_id){
            const existing_reactions = await this._conn.getAllFromIndex(
                'reactions', 'by_contact', reaction.contact_id)
            for (const existing of existing_reactions){
                if (existing.section_id === section_id && existing.subsection_id === subsection_id){
                    // If existing reaction is newer, cancel save, otherwise delete existing
                    if (existing.sent > reaction.sent){
                        return  // Existing is newer
                    }
                    this.reactions.remove(existing.id)
                }
            }
        }

        // If a null reaction then just needed to delete, not save
        if (content === null){
            return
        }

        await this._conn.add('reactions', reaction)
        return reaction
    }

    async reply_create(content:string, sent:Date, resp_token:string, section_id:string,
            subsection_id:string|null, ip:string, user_agent:string):Promise<Reply>{
        // Create a new reply
        const reply = new Reply({
            ...await this._gen_replaction(content, sent, resp_token, section_id, subsection_id, ip,
                user_agent),
        })
        await this._conn.add('replies', reply)
        return reply
    }

    async generate_dummy_data(multiplier:number):Promise<void>{
        // Generate dummy data for testing (can be called multiple times for even more data)

        // Make multiplier more exponential by timesing by itself
        // NOTE Multiplier should usually be 1|2|3, so will end up as 1|4|9
        multiplier *= multiplier

        // Create a profile
        const profile = await this.profiles.create()
        profile.email = 'sender@localhost'
        profile.msg_options_identity.sender_name = "Sender Name"
        profile.host = JSON.parse(process.env.VUE_APP_DEV_HOST_SETTINGS)
        profile.setup_step = null
        await this.profiles.set(profile)

        // Create contacts
        const first_names = ['Adam', 'Ben', 'Charlie', 'David', 'Edward', 'Fred', 'Greg',
            'Harry']
        const last_names = ['Andrews', 'Beaver', 'Chapman', 'Driver', 'Edmonds', 'Fudge',
            'Goods', 'Harvard']
        const contacts = await Promise.all([...range(100 * multiplier)].map(i => {
            return this.contacts.create(
                `${sample(first_names)} ${sample(last_names)}`,
                Math.random() > 0.8 ? '' : `blackhole+stello${i}@gracious.tech`,
            )
        }))

        // Create a text section
        const section_text = await this.sections.create({
            type: 'text',
            html: '<p>' + "A super interesting sentence. ".repeat(30) + '</p>',
            standout: null,
        })

        // Create a image section
        const image_blob = await (await fetch('_assets/branding/icon.png')).blob()
        const section_image = await this.sections.create({
            type: 'images',
            images: [{id: generate_token(), data: image_blob, caption: "An example image"}],
            crop: true,
        }) as Section<ContentImages>

        // Create a youtube section
        const section_youtube = await this.sections.create({
            type: 'video',
            format: 'iframe_youtube',
            id: '_fMSjImgJcI',
            start: null,
            end: null,
        })

        // Create a vimeo section
        const section_vimeo = await this.sections.create({
            type: 'video',
            format: 'iframe_vimeo',
            id: '168213438',
            start: null,
            end: null,
        })

        // Create base draft
        const draft = await this.drafts.create_object()
        draft.title = "A dummy newsletter"
        draft.profile = profile.id
        draft.sections = [
            [section_text.id, section_image.id],
            [section_youtube.id, section_vimeo.id],
        ]
        draft.recipients.include_contacts = contacts.slice(0, 10 * multiplier).map(c => c.id)
        await this.drafts.set(draft)

        // Create sent messages
        const titles = cycle([
            "How to write a newsletter",
            "November News",
            "Stello is cool!",
            "I can't think of an interesting title",
        ])
        const messages = await Promise.all([...range(10 * multiplier)].map(async i => {
            const draft_copy = await this.draft_copy(
                new Draft({...draft, title: titles.next().value}))
            const msg = await this.draft_to_message(draft_copy.id)
            return msg
        }))

        // Date creation helper
        const random_date = () => {
            const date = new Date()
            date.setDate(date.getDate() - Math.random() * 365)  // In last year
            return date
        }

        // Response contents generation
        const reactions = cycle(['like', 'love', 'laugh', 'wow', 'yay', 'pray', 'sad'])
        const reply_text = "Cool, great to hear about https://stello.news. "
        const random_reply = () => {
            return reply_text.repeat(Math.random() * 10)
        }

        // Create responses
        for (const msg of percent(messages)){
            const msg_section_ids = cycle(msg.draft.sections.flat())
            const msg_subsection_ids = cycle([null, section_image.content.images[0].id, null, null])
            for (const msg_copy of percent(await this.copies.list_for_msg(msg.id))){
                if (Math.random() > 0.5){
                    await this.reply_create(random_reply(), random_date(), msg_copy.resp_token,
                        null, null, '', '')
                }
                if (Math.random() > 0.5){
                    await this.reply_create(random_reply(), random_date(), msg_copy.resp_token,
                        msg_section_ids.next().value, msg_subsection_ids.next().value, '', '')
                }
                if (Math.random() > 0.5){
                    await this.reaction_create(reactions.next().value, random_date(),
                        msg_copy.resp_token, msg_section_ids.next().value,
                        msg_subsection_ids.next().value, '', '')
                }
            }
        }
    }
}

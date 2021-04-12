
import {openDB} from 'idb/with-async-ittr.js'

import {AppDatabaseSchema, AppDatabaseConnection, RecordReplaction, RecordSectionContent,
    } from './types'
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
import {remove_item} from '../utils/arrays'
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
                const encoded_title = new Option(draft.title).innerHTML  // Hack to encode text
                content.html = `<h1>${encoded_title}</h1>`
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

    async draft_to_message(draft_id:string):Promise<string>{
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
                contact_id: contact.id,
                contact_name: contact.name,
                contact_hello: contact.name_hello_result,
                contact_address: contact.address,
            })
        }))

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

        // Wait till done and then return message id
        await transaction.done
        return message.id
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
            ip:string, user_agent:string):Promise<RecordReplaction>{
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
            content: content,
            read: false,
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

    async reaction_create(content:string, sent:Date, resp_token:string, section_id:string,
            ip:string, user_agent:string):Promise<Reaction>{
        // Create a new reaction
        const reaction = new Reaction(
            await this._gen_replaction(content, sent, resp_token, section_id, ip, user_agent))
        await this._conn.add('reactions', reaction)
        return reaction
    }

    async reply_create(content:string, sent:Date, resp_token:string, section_id:string,
            ip:string, user_agent:string):Promise<Reply>{
        // Create a new reply
        const reply = new Reply({
            ...await this._gen_replaction(content, sent, resp_token, section_id, ip, user_agent),
            replied: false,
            archived: false,
        })
        await this._conn.add('replies', reply)
        return reply
    }
}

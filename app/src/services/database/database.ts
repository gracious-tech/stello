
import {openDB} from 'idb/with-async-ittr.js'

import {AppDatabaseSchema, AppDatabaseConnection, RecordReplaction} from './types'
import {DatabaseState} from './state'
import {DatabaseContacts} from './contacts'
import {DatabaseGroups} from './groups'
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


export function open_db():Promise<AppDatabaseConnection>{
    // Get access to db (and create/upgrade if needed)
    return openDB<AppDatabaseSchema>('main', 2, {
        async upgrade(db, old_version, new_version, transaction){

            // Begin upgrade at whichever version is already present (no break statements)
            // WARN Ensure all versions accounted for, or none will match
            switch (old_version){
                default:
                    throw new Error("Database version unknown (should never happen)")
                case 0:  // Version number when db didn't previously exist
                    // Create object stores
                    // NOTE If no keyPath is given then must provide a key for every transaction
                    const state = db.createObjectStore('state', {keyPath: 'key'})
                    const contacts = db.createObjectStore('contacts', {keyPath: 'id'})
                    const groups = db.createObjectStore('groups', {keyPath: 'id'})
                    const profiles = db.createObjectStore('profiles', {keyPath: 'id'})
                    const drafts = db.createObjectStore('drafts', {keyPath: 'id'})
                    const messages = db.createObjectStore('messages', {keyPath: 'id'})
                    const copies = db.createObjectStore('copies', {keyPath: 'id'})
                    const sections = db.createObjectStore('sections', {keyPath: 'id'})
                    const reads = db.createObjectStore('reads', {keyPath: 'id'})
                    const replies = db.createObjectStore('replies', {keyPath: 'id'})
                    const reactions = db.createObjectStore('reactions', {keyPath: 'id'})
                    // Create indexes
                    copies.createIndex('by_msg', 'msg_id')
                    copies.createIndex('by_contact', 'contact_id')
                    copies.createIndex('by_resp_token', 'resp_token')
                    reads.createIndex('by_msg', 'msg_id')
                    replies.createIndex('by_msg', 'msg_id')
                    replies.createIndex('by_contact', 'contact_id')
                    reactions.createIndex('by_msg', 'msg_id')
                    reactions.createIndex('by_contact', 'contact_id')
                case 1:
                    for await (const cursor of transaction.objectStore('profiles')){
                        // New property added after v0.0.4 (previously true if port 587)
                        cursor.value.smtp.starttls = cursor.value.smtp.port === 587
                        // Unintentionally saved in db in v0.0.4 and below
                        delete (cursor.value as any).smtp_providers
                        // Previously saved smtp port as string by mistake
                        // @ts-ignore since port may be string
                        cursor.value.smtp.port = parseInt(cursor.value.smtp.port, 10) || null
                        // Save changes
                        cursor.update(cursor.value)
                    }
            }
        },
    })
}


export class Database {

    _conn:AppDatabaseConnection
    state:DatabaseState
    contacts:DatabaseContacts
    groups:DatabaseGroups
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


    async draft_copy(draft_or_id:Draft|string):Promise<Draft>{
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

        // Also copy sections, but need to create copies of each too
        // WARN It's assumed all properties (except id) of sections is copyable
        const sections = await this.sections.get_multiple(original.sections)
        for (const section of sections){
            section.id = generate_token()
            copy.sections.push(section.id)
            this.sections.set(section)
        }

        // Save the copy to the database and return
        this.drafts.set(copy)
        return copy
    }


    async draft_section_create(draft:Draft, type:string, position:number):Promise<void>{
        // Add a new section to a draft
        const content:any = {type}

        // Content will vary by type
        if (type === 'text'){
            content.standout = null
            content.html = ''
            // If the first section, auto-add title as a heading if it exists
            if (!draft.sections.length && draft.title.trim()){
                const encoded_title = new Option(draft.title).innerHTML  // Hack to encode text
                content.html = `<h1>${encoded_title}</h1>`
            }
        } else if (type === 'images'){
            content.images = []
            content.crop = true
        } else {
            throw new Error('invalid_type')
        }

        // Create the section and then add it (in correct position) to draft
        const section = await this.sections.create(content)
        draft.sections.splice(position, 0, section.id)
        await this.drafts.set(draft)
    }

    async draft_section_remove(draft:Draft, section:Section):Promise<void>{
        // Remove a section from a draft
        draft.sections = draft.sections.filter(id => id !== section.id)
        await Promise.all([
            this.drafts.set(draft),
            this.sections.remove(section.id),
        ])
    }

    async draft_to_message(draft_id:string):Promise<string>{
        // Publish a draft, converting it to a Message

        // Get the draft
        const draft = await this.drafts.get(draft_id)

        // Create the message object
        const message = new Message({
            id: generate_token(),
            published: new Date(),
            draft: draft,
            assets_key: await generate_key_sym(true),
            assets_uploaded: {},
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
        this._conn.add('reads', read)
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
                replaction.section_num = msg.draft.sections.indexOf(section_id)

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
        this._conn.add('reactions', reaction)
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
        this._conn.add('replies', reply)
        return reply
    }
}

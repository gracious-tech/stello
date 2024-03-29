
import {openDB} from 'idb/with-async-ittr.js'

import {AppDatabaseSchema, AppDatabaseConnection, RecordReplaction, RecordDraft,
    RecordDraftPublished} from './types'
import {DatabaseState} from './state'
import {DatabaseContacts, Contact} from './contacts'
import {DatabaseGroups} from './groups'
import {DatabaseOAuths} from './oauths'
import {DatabaseProfiles, Profile} from './profiles'
import {DatabaseSubscribeForms} from './subscribe_forms'
import {DatabaseUnsubscribes} from './unsubscribes'
import {DatabaseDrafts, Draft} from './drafts'
import {DatabaseMessages, Message} from './messages'
import {DatabaseCopies, MessageCopy} from './copies'
import {DatabaseSections, copy_sections} from './sections'
import {DatabaseReads, Read} from './reads'
import {DatabaseReplies, Reply} from './replies'
import {DatabaseReactions, Reaction} from './reactions'
import {export_key, generate_hash, generate_token, generate_key_sym} from '../utils/crypt'
import {buffer_to_url64} from '../utils/coding'
import {migrate, migrate_async, DATABASE_VERSION} from './migrations'
import {get_final_recipients} from '../misc/recipients'
import {generate_example_data} from './example'
import {HostUser} from '@/services/hosts/types'
import {get_host_user} from '@/services/hosts/hosts'
import {HostStorageGeneratedGracious, new_credentials, new_login}
    from '@/services/hosts/gracious_user'


export async function open_db():Promise<AppDatabaseConnection>{
    // Get access to db (and create/upgrade if needed)
    let old_version_cache:number
    const db_conn = await openDB<AppDatabaseSchema>('main', DATABASE_VERSION, {
        upgrade(db, old_version, new_version, transaction){
            old_version_cache = old_version
            void migrate(transaction, old_version)
        },
    })
    await migrate_async(db_conn, old_version_cache!)
    return db_conn
}


export class Database {

    _conn:AppDatabaseConnection
    state:DatabaseState
    contacts:DatabaseContacts
    groups:DatabaseGroups
    oauths:DatabaseOAuths
    profiles:DatabaseProfiles
    subscribe_forms:DatabaseSubscribeForms
    unsubscribes:DatabaseUnsubscribes
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
        this.subscribe_forms = new DatabaseSubscribeForms(connection)
        this.unsubscribes = new DatabaseUnsubscribes(connection)
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
            original = await this.drafts.get(draft_or_id) as Draft
        }

        // Generate the copy initally as a new draft
        const copy = await this.drafts.create_object()

        // Only copy fields known to be safe to copy
        copy.reply_to = original.reply_to
        copy.title = original.title
        copy.profile = original.profile
        copy.options_identity = original.options_identity
        copy.options_security = original.options_security
        copy.recipients = original.recipients

        // Override template property, else use existing
        copy.template = template ?? original.template

        // Copy sections and save draft copy
        const transaction = this._conn.transaction(['drafts', 'sections'], 'readwrite')
        copy.sections = await copy_sections(transaction.objectStore('sections'), original.sections)
        void transaction.objectStore('drafts').put(copy)

        // Return the copy when done
        await transaction.done
        return copy
    }

    async draft_to_message(draft_id:string):Promise<Message>{
        // Publish a draft, converting it to a Message

        // Get the draft and profile
        const draft = await this.drafts.get(draft_id) as Draft
        const profile = await this.profiles.get(draft.profile!) as Profile

        // Determine expiration values, accounting for inheritance
        const lifespan = draft.options_security.lifespan ?? profile.msg_options_security.lifespan
        const max_reads = draft.options_security.max_reads ?? profile.msg_options_security.max_reads

        // Create the message object
        const message = new Message({
            id: generate_token(),
            published: new Date(),
            expired: false,
            draft: draft as RecordDraftPublished,
            assets_key: await generate_key_sym(true),
            assets_uploaded: {},
            lifespan,
            max_reads,
        })

        // Create copy objects for the recipients
        const contacts = await this.contacts.list()
        const unsubs = await this.unsubscribes.list_for_profile(draft.profile!)
        const recipients = get_final_recipients(draft, contacts, await this.groups.list(), unsubs)
        if (profile.options.send_to_self !== 'no'){
            recipients.push('self')  // Add special 'self' id to trigger creating a copy for self
        }
        const copies = await Promise.all(recipients.map(async contact_id => {

            // Get the contact's data
            let contact:Contact
            if (contact_id !== 'self'){
                // Not the special 'self' contact so get contact's data from db
                contact = contacts.find(c => c.id === contact_id)!
            } else {
                // Create a tmp contact for self that always has same id but never saved in db
                const send_to_self = profile.options.send_to_self
                contact = new Contact({
                    id: 'self',
                    created: new Date(),
                    name: profile.msg_options_identity.sender_name,
                    name_hello: '',
                    address: send_to_self === 'yes'
                        || (send_to_self === 'yes_without_replies_email' && !draft.reply_to)
                        ? profile.email : '',
                    notes: '',
                    service_account: null,
                    service_id: null,
                    multiple: true,  // So can't unsubscribe and unlimited opens
                })
            }

            // Generate secret and derive response token from it
            // NOTE Response token is derived from secret in case message has expired
            // NOTE Response token always kept in url64 so quicker for comparison
            // SECURITY No salt necessary since secret is random and one-time use
            const secret = await generate_key_sym(true)
            const resp_token = buffer_to_url64(await generate_hash(await export_key(secret), 0))

            // Generate server-side encryption secret
            // SECURITY This secret is exposed to server, so NOT for end-to-end encryption
            // NOTE Only use when end-to-end encryption not possible (e.g. invite images)
            const secret_sse = await generate_key_sym(true)

            // Construct and return the instance for this copy
            return new MessageCopy({
                id: generate_token(),
                msg_id: message.id,
                secret: secret,
                secret_sse: secret_sse,
                resp_token: resp_token,
                uploaded: false,
                uploaded_latest: false,
                invited: null,  // false only if error sending invite
                expired: false,
                contact_id: contact.id,
                contact_name: contact.name,
                contact_hello: contact.name_hello_result,
                contact_address: contact.address,
                contact_multiple: contact.multiple,
            })
        }))

        // Update replaction's `replied` property (if `reply_to` set)
        // NOTE Not part of transaction since not a critical part of message publishing
        if (draft.reply_to){
            const replaction = await this.replies.get(draft.reply_to)
                || await this.reactions.get(draft.reply_to)
            if (replaction && !replaction.replied){
                replaction.replied = true
                void this[replaction.is_reply ? 'replies' : 'reactions'].set(replaction)
            }
        }

        // Start transaction (now that all non-db async stuff is done)
        const transaction = this._conn.transaction(['drafts', 'messages', 'copies'], 'readwrite')
        const store_drafts = transaction.objectStore('drafts')
        const store_messages = transaction.objectStore('messages')
        const store_copies = transaction.objectStore('copies')

        // Add the new objects
        void store_messages.add(message)
        for (const copy of copies){
            void store_copies.add(copy)
        }

        // Delete the original draft
        void store_drafts.delete(draft.id)

        // Wait till done and then return message
        await transaction.done
        return message
    }

    draft_recipients_descriptor():(draft:RecordDraft)=>Promise<string>{
        // Returns a fn for getting as useful a desc of recipients as possible
        // NOTE Caches group and contact names so can reuse for multiple drafts more efficiently

        const group_names:Record<string, string|null> = {}
        const contact_names:Record<string, string|null> = {}

        return async (draft:RecordDraft):Promise<string> => {
            // Unpack recipient arrays
            const {include_groups, exclude_groups, include_contacts, exclude_contacts} =
                draft.recipients

            // Collect known names
            const names = []
            if (include_groups.includes('all')){
                // All contacts included so ignore any other "includes"
                names.push("All contacts")
            } else if (include_groups.length){
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

    async new_host_user(profile:Profile):Promise<HostUser>{
        // Return new instance of correct host class with profile's host settings
        let generated
        let bucket:string
        let region:string
        let user:string|null

        if (profile.host?.cloud === 'gracious'){
            bucket = import.meta.env.VITE_HOSTED_BUCKET
            region = import.meta.env.VITE_HOSTED_REGION
            user = profile.host.username

            // If id token expired, will need to get a new one
            if (new Date().getTime() > profile.host.id_token_exires - 1000 * 60 * 5){
                const login = await new_login(profile.host.username, profile.host.password)
                profile.host.id_token = login.IdToken!
                profile.host.id_token_exires = login.id_token_expires
                void this.profiles.set(profile)
            }

            // Get new aws credentials
            generated = {
                credentials: await new_credentials(profile.host.federated_id,
                    profile.host.id_token),
                username: profile.host.username,
                password: profile.host.password,
            } as HostStorageGeneratedGracious
        } else {
            generated = profile.host!.generated
            bucket = profile.host!.bucket
            region = profile.host!.region
            user = null
        }

        const host_user_class = get_host_user(profile.host!.cloud)
        return new host_user_class(generated, bucket, region, user)
    }

    async read_create(sent:Date, resp_token:string, ip:string|null,
            user_agent:string):Promise<Read|null>{
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

    async _gen_replaction(content:string, sent:Date, resp_token:string, section_id:string|null,
            subsection_id:string|null, ip:string|null, user_agent:string):Promise<RecordReplaction>{
        // Generate a replaction object that can be used for a reply or reaction

        // Construct new object with data already known
        const replaction:RecordReplaction = {
            id: '',  // Set later by calling methods
            sent: sent,
            ip: ip,
            user_agent: user_agent,
            copy_id: null,
            msg_id: null,
            msg_title: null,
            contact_id: null,
            contact_name: null,
            section_id: section_id,
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
            // Preserve some kind of name in case contact later deleted
            // NOTE Whole address used as unlike `contact.display`, can't open contact to see whole
            replaction.contact_name =
                msg_copy.contact_name || msg_copy.contact_hello || msg_copy.contact_address

            // Get msg so can know title
            const msg = (await this.messages.get(msg_copy.msg_id))!
            replaction.msg_title = msg.draft.title
        }

        return replaction
    }

    async reaction_create(content:string|null, sent:Date, resp_token:string, section_id:string,
            subsection_id:string|null, ip:string|null, user_agent:string):Promise<Reaction|null>{
        // Create a new reaction
        // NOTE If content is null it will be deleted later anyway, so pass as ''
        const reaction = new Reaction(await this._gen_replaction(content ?? '', sent, resp_token,
            section_id, subsection_id, ip, user_agent))

        // Reactions are useless without knowing who from (and can't give unique id either)
        if (!reaction.copy_id){
            return null
        }

        // Can now set id from other properties so only one reaction per section
        reaction.id = reaction.id_from_properties

        // No content means must delete any existing reaction with same id
        if (!content){
            await this._conn.delete('reactions', reaction.id)
            return null
        }

        await this._conn.put('reactions', reaction)
        return reaction
    }

    async reply_create(content:string, sent:Date, resp_token:string, section_id:string|null,
            subsection_id:string|null, ip:string|null, user_agent:string):Promise<Reply>{
        // Create a new reply
        const reply = new Reply(await this._gen_replaction(content, sent, resp_token, section_id,
            subsection_id, ip, user_agent))
        reply.id = generate_token()
        await this._conn.add('replies', reply)
        return reply
    }

    async generate_example_data(multiplier:number){
        // Generate random example data for testing
        return generate_example_data(this, multiplier)
    }
}

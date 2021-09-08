
import {
    AppDatabaseConnection, RecordDraft, MessageOptionsIdentity, MessageOptionsSecurity,
    RecordDraftRecipients,
} from './types'
import {Group} from './groups'
import {Contact} from './contacts'
import {Unsubscribe} from './unsubscribes'
import {generate_token} from '@/services/utils/crypt'
import {remove_value} from '@/services/utils/arrays'


export class Draft implements RecordDraft {

    id:string
    template:boolean
    reply_to:string
    modified:Date
    title:string
    sections:([string]|[string, string])[]
    profile:string
    options_identity:MessageOptionsIdentity
    options_security:MessageOptionsSecurity
    recipients:RecordDraftRecipients

    constructor(db_object:RecordDraft){
        Object.assign(this, db_object)
    }

    get display():string{
        // Return string for displaying draft (that will never be blank)
        return this.title.trim() || "[Untitled]"
    }

    get_final_recipients(contacts:Contact[], groups:Group[], unsubscribes:Unsubscribe[]):string[]{
        // Return array of contact ids to send to after accounting for all includes/excludes
        const recipients:string[] = []

        // Create a mapping of group ids to their contacts
        const groups_dict:Record<string, string[]> = {
            all: contacts.map(contact => contact.id),
        }
        for (const group of groups){
            groups_dict[group.id] = group.contacts
        }

        // Add all contacts included by groups
        for (const group_id of this.recipients.include_groups){
            if (group_id in groups_dict){  // WARN Group may no longer exist
                // WARN Can easily result in duplicate ids, which will be filtered out later
                recipients.push(...groups_dict[group_id])
            }
        }

        // Remove all contacts excluded by groups
        for (const group_id of this.recipients.exclude_groups){
            if (group_id in groups_dict){  // WARN Group may no longer exist
                for (const contact_id of groups_dict[group_id]){
                      // WARN May need to remove duplicates, so search whole array
                    remove_value(recipients, contact_id)
                }
            }
        }


        // Remove all contacts who have unsubscribed (only applies to group inclusions)
        for (const unsub of unsubscribes){
            if (unsub.profile === this.profile){
                // WARN May need to remove duplicates, so search whole array
                remove_value(recipients, unsub.contact)
            }
        }

        // Add all contacts included explicitly (overrides group exclude & unsubscribes)
        recipients.push(...this.recipients.include_contacts)

        // Remove all contacts excluded explicitly (overrides all)
        for (const contact_id of this.recipients.exclude_contacts){
            remove_value(recipients, contact_id)  // WARN Must search whole array in case duplicates
        }

        // Deduplicate (both ids and addresses)
        const address_map = Object.fromEntries(contacts.map(c => [c.id, c.address?.trim()]))
        const included_ids = new Set()
        const included_addresses = new Set()
        return recipients.filter(id => {
            if (included_ids.has(id)){
                return false
            }
            included_ids.add(id)
            if (address_map[id]){
                if (included_addresses.has(address_map[id])){
                    return false
                }
                included_addresses.add(address_map[id])
            }
            return true
        })
    }

}


export class DatabaseDrafts {

    _conn:AppDatabaseConnection

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
    }

    async list():Promise<Draft[]>{
        // Get all drafts
        return (await this._conn.getAll('drafts')).map(draft => new Draft(draft))
    }

    async get(id:string):Promise<Draft>{
        // Get single draft by id
        const draft = await this._conn.get('drafts', id)
        return draft && new Draft(draft)
    }

    async set(draft:RecordDraft):Promise<void>{
        // Insert or update given draft
        await this._conn.put('drafts', draft)
    }

    async create_object(template=false):Promise<Draft>{
        // Return a new draft object (without saving to db)
        return new Draft({
            id: generate_token(),
            template,
            reply_to: null,
            modified: new Date(),
            title: '',
            sections: [],
            profile: self.app_store.state.default_profile || null,
            options_identity: {
                // null to inherit from profile
                sender_name: '',
                invite_image: null,
                invite_tmpl_email: null,
                invite_tmpl_clipboard: null,
            },
            options_security:{
                // null to inherit from profile
                lifespan: null,
                max_reads: null,
            },
            recipients: {
                include_groups: [],
                include_contacts: [],
                exclude_groups: [],
                exclude_contacts: [],
            },
        })
    }

    async create(template=false):Promise<Draft>{
        // Create a new draft (and save to db)
        const draft = await this.create_object(template)
        await this._conn.add('drafts', draft)
        return draft
    }

    async remove(id:string):Promise<void>{
        // Remove the draft with given id (and its assets)

        // Start transaction and get stores
        const transaction = this._conn.transaction(['drafts', 'sections'], 'readwrite')
        const store_drafts = transaction.objectStore('drafts')
        const store_sections = transaction.objectStore('sections')

        // Get the message's sections so can remove them
        const section_ids = (await store_drafts.get(id)).sections.flat()

        // Remove the message and its sections
        store_drafts.delete(id)
        for (const section_id of section_ids){
            store_sections.delete(section_id)
        }

        // Task done when transaction completes
        await transaction.done
    }
}

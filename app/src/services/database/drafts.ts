
import {
    AppDatabaseConnection, RecordDraft, MessageOptionsIdentity, MessageOptionsSecurity,
    RecordDraftRecipients,
} from './types'
import {Group} from './groups'
import {generate_token} from '@/services/utils/crypt'
import {remove} from '@/services/utils/arrays'


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

    get_final_recipients(groups:Group[]):string[]{
        // Return array of contact ids to send to after accounting for all includes/excludes
        const recipients = []

        // Create a mapping of group ids to their contacts
        const groups_dict = {}
        for (const group of groups){
            groups_dict[group.id] = group.contacts
        }

        // Add all contacts included by groups
        for (const group_id of this.recipients.include_groups){
            if (group_id in groups_dict){  // WARN Group may no longer exist
                recipients.push(...groups_dict[group_id])
            }
        }

        // Remove all contacts excluded by groups
        for (const group_id of this.recipients.exclude_groups){
            if (group_id in groups_dict){  // WARN Group may no longer exist
                for (const contact_id of groups_dict[group_id]){
                    remove(recipients, contact_id)
                }
            }
        }

        // Add all contacts included explicitly (overrides group exclude)
        recipients.push(...this.recipients.include_contacts)

        // Remove all contacts excluded explicitly (overrides all)
        for (const contact_id of this.recipients.exclude_contacts){
            remove(recipients, contact_id)
        }

        // Deduplicate
        return Array.from(new Set(recipients).values())
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

    async set(draft:Draft):Promise<void>{
        // Insert or update given draft
        await this._conn.put('drafts', draft)
    }

    async create_object():Promise<Draft>{
        // Return a new draft object (without saving to db)
        return new Draft({
            id: generate_token(),
            template: false,
            reply_to: null,
            modified: new Date(),
            title: '',
            sections: [],
            profile: self._store.state.default_profile || null,
            options_identity: {
                // null to inherit from profile
                sender_name: '',
                invite_tmpl_email: '',
                invite_tmpl_clipboard: '',
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

    async create():Promise<Draft>{
        // Create a new draft (and save to db)
        const draft = await this.create_object()
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

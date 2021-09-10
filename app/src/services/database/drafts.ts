
import {AppDatabaseConnection, RecordDraft, RecordDraftRecipients} from './types'
import {generate_token} from '@/services/utils/crypt'


export class Draft implements RecordDraft {

    id!:string
    template!:boolean
    reply_to!:string
    modified!:Date
    title!:string
    sections!:([string]|[string, string])[]
    profile!:string
    options_identity!:{
        sender_name:string
        invite_image:Blob|null
        invite_tmpl_email:string|null
        invite_tmpl_clipboard:null  // TODO rm, not used
    }
    options_security!:{
        lifespan:number|null
        max_reads:number|null
    }
    recipients!:RecordDraftRecipients

    constructor(db_object:RecordDraft){
        Object.assign(this, db_object)
    }

    get display():string{
        // Return string for displaying draft (that will never be blank)
        return this.title.trim() || "[Untitled]"
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

    async get(id:string):Promise<Draft|undefined>{
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
        const section_ids = (await store_drafts.get(id))?.sections.flat() ?? []

        // Remove the message and its sections
        void store_drafts.delete(id)
        for (const section_id of section_ids){
            void store_sections.delete(section_id)
        }

        // Task done when transaction completes
        await transaction.done
    }
}

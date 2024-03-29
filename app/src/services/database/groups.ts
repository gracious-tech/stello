
import {AppDatabaseConnection, RecordGroup} from './types'
import {generate_token} from '@/services/utils/crypt'


export class Group implements RecordGroup {

    id!:string
    name!:string
    contacts!:string[]
    service_account!:string|null
    service_id!:string|null

    constructor(db_object:RecordGroup){
        Object.assign(this, db_object)
    }

    get display():string{
        // Return string for displaying group (that will never be blank)
        return this.name.trim() || "[Nameless]"
    }

}


export class DatabaseGroups {

    _conn:AppDatabaseConnection

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
    }

    async list():Promise<Group[]>{
        // Get all groups
        return (await this._conn.getAll('groups')).map(group => new Group(group))
    }

    async list_for_account(issuer:string, issuer_id:string):Promise<Group[]>{
        // Get all groups belonging to given service account
        const account = `${issuer}:${issuer_id}`
        const groups = await this._conn.getAllFromIndex('groups', 'by_service_account', account)
        return groups.map(group => new Group(group))
    }

    async get(id:string):Promise<Group|undefined>{
        // Get single group by id
        const group = await this._conn.get('groups', id)
        return group && new Group(group)
    }

    async set(group:RecordGroup):Promise<void>{
        // Insert or update group
        await this._conn.put('groups', group)
    }

    async create(name='', contacts:string[]=[], service_account:string|null=null,
            service_id:string|null=null):Promise<Group>{
        // Create a new group
        const group = new Group({
            id: generate_token(),
            name,
            contacts,
            service_account,
            service_id,
        })
        await this._conn.add('groups', group)
        return group
    }

    async remove(id:string):Promise<void>{
        // Remove the group and remove it from drafts

        // Start transaction and get stores
        const transaction = this._conn.transaction(['groups', 'drafts'], 'readwrite')
        const store_groups = transaction.objectStore('groups')
        const store_drafts = transaction.objectStore('drafts')

        // Remove the actual group
        void store_groups.delete(id)

        // Remove the group from drafts
        // WARN Not removing from drafts within sent messages as could be heaps and so inefficient
        for (const draft of await store_drafts.getAll()){
            // Filter group out of draft's recipients and if changed then save changes
            const filtered_include = draft.recipients.include_groups.filter(val => val !== id)
            const filtered_exclude = draft.recipients.exclude_groups.filter(val => val !== id)
            if (filtered_include.length !== draft.recipients.include_groups.length ||
                    filtered_exclude.length !== draft.recipients.exclude_groups.length){
                draft.recipients.include_groups = filtered_include
                draft.recipients.exclude_groups = filtered_exclude
                void store_drafts.put(draft)
            }
        }

        // Task done when transaction completes
        await transaction.done

    }
}


import {AppDatabaseConnection, RecordContact} from './types'
import {generate_token} from '@/services/utils/crypt'
import {address_type} from '@/services/utils/misc'


export class Contact implements RecordContact {

    id:string
    created:Date
    name:string
    name_hello:string
    address:string
    notes:string

    constructor(db_object:RecordContact){
        Object.assign(this, db_object)
    }

    get display():string{
        // Return string for displaying contact (that will never be blank)
        return this.name.trim() || "[Nameless]"
    }

    get name_hello_result():string{
        // Return name_hello result which uses value if given or otherwise defaults to first word
        return this.name_hello.trim() || this.name.trim().split(' ')[0]
    }

    get address_type():string{
        // Return the type of address for the contact
        return address_type(this.address)
    }
}


export class DatabaseContacts {

    _conn:AppDatabaseConnection

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
    }

    async list():Promise<Contact[]>{
        // Get all contacts
        return (await this._conn.getAll('contacts')).map(contact => new Contact(contact))
    }

    async get(id:string):Promise<Contact>{
        // Get single contact by id
        const contact = await this._conn.get('contacts', id)
        return contact && new Contact(contact)
    }

    async set(contact:RecordContact):Promise<void>{
        // Insert or update contact
        await this._conn.put('contacts', contact)
    }

    async create(name='', address=''):Promise<Contact>{
        // Create a new contact
        const contact = new Contact({
            id: generate_token(),
            created: new Date(),
            name: name,
            name_hello: '',
            address: address,
            notes: '',
        })
        this._conn.add('contacts', contact)
        return contact
    }

    async remove(id:string):Promise<void>{
        // Remove the contact and certain linked objects
        // NOTE Will not remove refs to contact within already sent messages

        // Start transaction and get stores
        const transaction = this._conn.transaction(['contacts', 'groups', 'drafts'], 'readwrite')
        const store_contacts = transaction.objectStore('contacts')
        const store_groups = transaction.objectStore('groups')
        const store_drafts = transaction.objectStore('drafts')

        // Remove the actual contact
        store_contacts.delete(id)

        // Remove the contact from groups
        for (const group of await store_groups.getAll()){
            // Filter contact out of group's contacts and if changed then save changes
            const filtered_contacts = group.contacts.filter(val => val !== id)
            if (filtered_contacts.length !== group.contacts.length){
                group.contacts = filtered_contacts
                store_groups.put(group)
            }
        }

        // Remove the contact from drafts
        for (const draft of await store_drafts.getAll()){
            // Filter contact out of draft's recipients and if changed then save changes
            const filtered_include = draft.recipients.include_contacts.filter(val => val !== id)
            const filtered_exclude = draft.recipients.exclude_contacts.filter(val => val !== id)
            if (filtered_include.length !== draft.recipients.include_contacts.length ||
                    filtered_exclude.length !== draft.recipients.exclude_contacts.length){
                draft.recipients.include_contacts = filtered_include
                draft.recipients.exclude_contacts = filtered_exclude
                store_drafts.put(draft)
            }
        }

        // Task done when transaction completes
        await transaction.done

    }
}

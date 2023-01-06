
import {AppDatabaseConnection, RecordContact} from './types'
import {generate_token} from '@/services/utils/crypt'
import {partition} from '../utils/strings'


interface ContactCreateArgs{
    name?:string
    address?:string
    service_account?:string
    service_id?:string
}


export class Contact implements RecordContact {

    // Stello owned
    id!:string
    created!:Date
    name!:string
    name_hello!:string
    address!:string
    notes!:string
    service_account!:string|null
    service_id!:string|null
    multiple!:boolean

    constructor(db_object:RecordContact){
        Object.assign(this, db_object)
    }

    get display():string{
        // Return string for displaying contact (that will never be blank)
        return this.name.trim()
            || this.name_hello.trim()
            || partition(this.address ?? '', '@')[0]?.trim()
            || "[Nameless]"
    }

    get name_hello_result():string{
        // Returns value if given or otherwise defaults to all parts of name except the last
        // e.g. "Sarah & Simon Smith" -> "Sarah & Simon"
        // NOTE If multiple, defaults to whole name
        return this.name_hello.trim()
            || (!this.multiple && this.name.trim().split(' ').slice(0, -1).join(' '))
            || this.name
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

    async list_for_account(issuer:string, issuer_id:string):Promise<Contact[]>{
        // Get all contacts belonging to given service account
        const account = `${issuer}:${issuer_id}`
        const contacts = await this._conn.getAllFromIndex('contacts', 'by_service_account', account)
        return contacts.map(contact => new Contact(contact))
    }

    async list_for_address(address:string):Promise<Contact[]>{
        // Get all contacts with given address
        const contacts = await this._conn.getAllFromIndex('contacts', 'by_address', address)
        return contacts.map(contact => new Contact(contact))
    }

    async get(id:string):Promise<Contact|undefined>{
        // Get single contact by id
        const contact = await this._conn.get('contacts', id)
        return contact && new Contact(contact)
    }

    async set(contact:RecordContact):Promise<void>{
        // Insert or update contact
        await this._conn.put('contacts', contact)
    }

    create_object():Contact{
        // Create a new contact object
        return new Contact({
            id: generate_token(),
            created: new Date(),
            name: '',
            name_hello: '',
            address: '',
            notes: '',
            service_account: null,
            service_id: null,
            multiple: false,
        })
    }

    async create(input?:ContactCreateArgs):Promise<Contact>
    async create(input:ContactCreateArgs[]):Promise<Contact[]>
    async create(input:ContactCreateArgs|ContactCreateArgs[]={}):Promise<Contact|Contact[]>{
        // Create new contacts and save to db

        // Detect type of input
        const is_array = Array.isArray(input)

        // Start transaction and get store
        const transaction = this._conn.transaction('contacts', 'readwrite')
        const store_contacts = transaction.objectStore('contacts')

        // Add contacts
        const contacts = []
        for (const item of (is_array ? input : [input])){
            const contact = this.create_object()
            contact.name = item.name ?? ''
            contact.address = item.address ?? ''
            contact.service_account = item.service_account ?? null
            contact.service_id = item.service_id ?? null
            void store_contacts.add(contact)
            contacts.push(contact)
        }
        await transaction.done

        return is_array ? contacts : contacts[0]!
    }


    async remove(ids:string|string[]):Promise<void>{
        // Remove the contact/s
        // NOTE Doesn't remove contacts from groups/drafts etc (stale ids filtered when loaded)

        // Normalise input
        ids = typeof ids === 'string' ? [ids] : ids

        // Start transaction and get store
        const transaction = this._conn.transaction('contacts', 'readwrite')
        const store_contacts = transaction.objectStore('contacts')

        // Remove the contacts
        for (const id of ids){
            void store_contacts.delete(id)
        }

        // Task done when transaction completes
        await transaction.done
    }
}

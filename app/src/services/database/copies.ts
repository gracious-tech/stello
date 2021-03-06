
import {address_type} from '@/services/utils/misc'
import {AppDatabaseConnection, RecordMessageCopy} from './types'


export class MessageCopy implements RecordMessageCopy {

    id:string
    msg_id:string
    secret:CryptoKey
    resp_token:string
    uploaded:boolean
    uploaded_latest:boolean
    invited:boolean
    contact_id:string
    contact_name:string
    contact_hello:string
    contact_address:string

    constructor(db_object:RecordMessageCopy){
        Object.assign(this, db_object)
    }

    get display():string{
        // Return string for displaying copy (that will never be blank)
        return this.contact_name.trim() || "[Nameless]"
    }

    get contact_address_type():string{
        // Return the type of address for the contact
        return address_type(this.contact_address)
    }

    get sent():boolean{
        // Whether the copy can be considered "sent" to the contact or not
        // NOTE Will be null if it is user's job to send invite
        // TODO Account for uploaded_latest value
        if (!this.uploaded){
            return false
        }
        if (this.invited){
            return true
        }
        return this.contact_address_type === 'email' ? false : null
    }
}


export class DatabaseCopies {

    _conn:AppDatabaseConnection

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
    }

    async list_for_msg(msg_id:string):Promise<MessageCopy[]>{
        // Get all copies for given message id
        const copies = await this._conn.getAllFromIndex('copies', 'by_msg', msg_id)
        return copies.map(copy => new MessageCopy(copy))
    }

    async get(id:string):Promise<MessageCopy>{
        // Get single copy by id
        const copy = await this._conn.get('copies', id)
        return copy && new MessageCopy(copy)
    }

    async get_by_resp_token(resp_token:string):Promise<MessageCopy>{
        // Get single copy by resp_token
        const copy = await this._conn.getFromIndex('copies', 'by_resp_token', resp_token)
        return copy && new MessageCopy(copy)
    }

    async set(copy:MessageCopy):Promise<void>{
        // Insert or update given copy
        await this._conn.put('copies', copy)
    }
}

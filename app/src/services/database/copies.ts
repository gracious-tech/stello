
import {AppDatabaseConnection, RecordMessageCopy} from './types'


export class MessageCopy implements RecordMessageCopy {

    id!:string
    msg_id!:string
    secret!:CryptoKey
    secret_sse!:CryptoKey
    resp_token!:string
    uploaded!:boolean
    uploaded_latest!:boolean
    invited!:boolean
    expired!:boolean
    contact_id!:string
    contact_name!:string
    contact_hello!:string
    contact_address!:string
    contact_multiple!:boolean

    constructor(db_object:RecordMessageCopy){
        Object.assign(this, db_object)
    }

    get display():string{
        // Return string for displaying copy (that will never be blank)
        return this.contact_name.trim() || this.contact_address.trim() || "[Nameless]"
    }

    get status():'pending'|'manual'|'error'|'success'|'expired'{
        // Return a status code for the sending of the copy
        if (this.expired)
            return 'expired'
        if (this.invited === false)
            return 'error'
        if (this.invited === true)
            return 'success'
        if (this.uploaded && !this.contact_address)
            return 'manual'
        return 'pending'
    }
}


export class DatabaseCopies {

    _conn:AppDatabaseConnection

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
    }

    async list():Promise<MessageCopy[]>{
        // Get all copies
        const copies = await this._conn.getAll('copies')
        return copies.map(copy => new MessageCopy(copy))
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

    async set(copy:RecordMessageCopy):Promise<void>{
        // Insert or update given copy
        await this._conn.put('copies', copy)
    }
}

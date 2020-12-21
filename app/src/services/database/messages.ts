
import {AppDatabaseConnection, RecordMessage, RecordDraft} from './types'


export class Message implements RecordMessage {

    id:string
    published:Date
    draft:RecordDraft
    assets_key:CryptoKey
    assets_uploaded:{[id:string]:boolean}

    constructor(db_object:RecordMessage){
        Object.assign(this, db_object)
    }

    get display():string{
        // Return string for displaying message (that will never be blank)
        return this.draft.title.trim() || "[Untitled]"
    }
}


export class DatabaseMessages {

    _conn:AppDatabaseConnection

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
    }

    async list():Promise<Message[]>{
        // Get all messages
        return (await this._conn.getAll('messages')).map(message => new Message(message))
    }

    async get(id:string):Promise<Message>{
        // Get single message by id
        const message = await this._conn.get('messages', id)
        return message && new Message(message)
    }

    async set(message:Message):Promise<void>{
        // Insert or update given message
        await this._conn.put('messages', message)
    }
}

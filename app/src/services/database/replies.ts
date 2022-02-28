
import {AppDatabaseConnection, RecordReply} from './types'


export class Reply implements RecordReply {

    id!:string
    sent!:Date
    ip!:string
    user_agent!:string
    copy_id!:string
    msg_id!:string
    msg_title!:string
    contact_id!:string
    contact_name!:string
    section_id!:string|null
    subsection_id!:string|null
    content!:string
    read!:boolean
    replied!:boolean
    archived!:boolean

    constructor(db_object:RecordReply){
        Object.assign(this, db_object)
    }

    get is_reaction(){
        return false  // So can access when dealing with a replaction (type unknown)
    }

    get is_reply(){
        return true  // So can access when dealing with a replaction (type unknown)
    }
}


export class DatabaseReplies {

    _conn:AppDatabaseConnection

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
    }

    async list():Promise<Reply[]>{
        // Get all replies
        return (await this._conn.getAll('replies')).map(r => new Reply(r))
    }

    async get(id:string):Promise<Reply|undefined>{
        // Get single reply by id
        const reply = await this._conn.get('replies', id)
        return reply && new Reply(reply)
    }

    async set(reply:RecordReply):Promise<void>{
        // Insert or update given reply
        await this._conn.put('replies', reply)
    }

    async remove(id:string):Promise<void>{
        // Remove the reply with given id
        await this._conn.delete('replies', id)
    }
}

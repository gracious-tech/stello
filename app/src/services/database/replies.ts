
import {AppDatabaseConnection, RecordReply} from './types'


export class Reply implements RecordReply {

    id:string
    sent:Date
    ip:string
    user_agent:string
    copy_id:string
    msg_id:string
    msg_title:string
    contact_id:string
    contact_name:string
    section_id:string
    section_num:number
    section_type:string
    content:string
    read:boolean
    replied:boolean
    archived:boolean

    constructor(db_object:RecordReply){
        Object.assign(this, db_object)
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

    async get(id:string):Promise<Reply>{
        // Get single reply by id
        const reply = await this._conn.get('replies', id)
        return reply && new Reply(reply)
    }

    async set(reply:Reply):Promise<void>{
        // Insert or update given reply
        await this._conn.put('replies', reply)
    }

    async remove(id:string):Promise<void>{
        // Remove the reply with given id
        await this._conn.delete('replies', id)
    }
}

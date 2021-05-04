
import {AppDatabaseConnection, RecordReaction} from './types'


export class Reaction implements RecordReaction {

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
    subsection_id:string|null
    content:string
    read:boolean

    constructor(db_object:RecordReaction){
        Object.assign(this, db_object)
    }
}


export class DatabaseReactions {

    _conn:AppDatabaseConnection

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
    }

    async list():Promise<Reaction[]>{
        // Get all reactions
        return (await this._conn.getAll('reactions')).map(r => new Reaction(r))
    }

    async get(id:string):Promise<Reaction>{
        // Get single reaction by id
        const reaction = await this._conn.get('reactions', id)
        return reaction && new Reaction(reaction)
    }

    async set(reaction:Reaction):Promise<void>{
        // Insert or update given reaction
        await this._conn.put('reactions', reaction)
    }

    async remove(id:string):Promise<void>{
        // Remove the reaction with given id
        await this._conn.delete('reactions', id)
    }
}

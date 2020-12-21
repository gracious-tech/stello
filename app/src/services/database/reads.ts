
import {AppDatabaseConnection, RecordRead} from './types'


export class Read implements RecordRead {

    id:string
    sent:Date
    ip:string
    user_agent:string
    copy_id:string
    msg_id:string

    constructor(db_object:RecordRead){
        Object.assign(this, db_object)
    }
}


export class DatabaseReads {

    _conn:AppDatabaseConnection

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
    }

    async list_for_msg(msg_id:string):Promise<Read[]>{
        // Get all reads for given message id
        const reads = await this._conn.getAllFromIndex('reads', 'by_msg', msg_id)
        return reads.map(read => new Read(read))
    }

    async set(read:Read):Promise<void>{
        // Insert or update given read
        await this._conn.put('reads', read)
    }
}


import {AppDatabaseConnection, RecordState} from './types'


export class DatabaseState {

    _conn:AppDatabaseConnection

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
    }

    async list():Promise<RecordState[]>{
        // Get all items from the state store
        return this._conn.getAll('state')
    }

    async set(item:RecordState):Promise<void>{
        // Add or update given item
        await this._conn.put('state', item)
    }
}


import {openDB, IDBPDatabase, DBSchema} from 'idb'


interface DisplayerDatabaseSchema extends DBSchema {

    dict:{
        key:string,  // The type of whatever key is used (defined during upgrade)
        value:{
            key:string,
            value:any,
        },
    },

    messages:{
        key:string,
        value:MessageRecord,
    },

}


export interface MessageRecord {
    id:string
    secret:CryptoKey
    title:string
    published:Date
}


class DisplayerDatabase {

    _conn:IDBPDatabase<DisplayerDatabaseSchema>|any

    async connect():Promise<void>{
        // Init connection to the database
        const db_name = 'stello'  // Change to start fresh after significant refactor
        this._conn = await openDB<DisplayerDatabaseSchema>(db_name, 1, {
            upgrade(db, old_version, new_version, transaction){
                // NOTE If no keyPath is given then must provide a key for every transaction
                db.createObjectStore('dict', {keyPath: 'key'})
                db.createObjectStore('messages', {keyPath: 'id'})
            },
        }).catch(error => {
            // Firefox doesn't support indexeddb in some cases, so return dummy connection instead
            console.error(error)
            console.log("Database unavailable")
            return {
                get: async () => undefined,
                getAll: async () => [],
                put: async () => undefined,
            }
        })
    }

    async dict_get(key:string):Promise<any>{
        // Get the value from dict table for given key
        const obj = await this._conn.get('dict', key)
        return obj ? obj.value : null
    }

    async dict_get_all():Promise<object>{
        // Get all key/values as an object
        const items = await this._conn.getAll('dict')
        return items.reduce((obj, item) => {
            obj[item.key] = item.value
            return obj
        }, {})
    }

    async dict_set(key:string, value:any):Promise<void>{
        // Save a key/value in dict table
        await this._conn.put('dict', {key, value})
    }

    async message_set(message:MessageRecord):Promise<void>{
        // Save a message
        await this._conn.put('messages', message)
    }
}


// Expose only a single instance of the database
export const database = new DisplayerDatabase()

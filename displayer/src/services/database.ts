
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

    reactions:{
        key:string,
        value:{
            id:string,  // Either subsection, or section if no subsection
            message:string,
            section:string,
            subsection:string|null,
            content:string,
            sent:Date,
        },
    },

}


export interface MessageRecord {
    id:string
    secret:CryptoKey
    title:string
    published:Date
}


const DATABASE_VERSION = 2


class DisplayerDatabase {

    _conn!: IDBPDatabase<DisplayerDatabaseSchema>

    async connect():Promise<void>{
        // Init connection to the database
        const db_name = 'stello'  // Change to start fresh after significant refactor
        this._conn = await openDB<DisplayerDatabaseSchema>(db_name, DATABASE_VERSION, {
            upgrade(db, old_version, new_version, transaction){
                switch (old_version){
                    default:
                        throw new Error("Database version unknown (should never happen)")
                    case 0:  // Version number when db doesn't exist
                        db.createObjectStore('dict', {keyPath: 'key'})
                        db.createObjectStore('messages', {keyPath: 'id'})
                    case 1:
                        db.createObjectStore('reactions', {keyPath: 'id'})
                }
            },
        }).catch(error => {
            // Firefox doesn't support indexeddb in some cases, so return dummy connection instead
            console.error(error)
            console.log("Database unavailable")
            return {
                get: async () => undefined,
                getAll: async () => [],
                put: async () => undefined,
            } as unknown as IDBPDatabase<DisplayerDatabaseSchema>
        })
    }

    async dict_get(key:string):Promise<any>{
        // Get the value from dict table for given key
        const obj = await this._conn.get('dict', key)
        return obj ? obj.value : null
    }

    async dict_get_all():Promise<Record<string, any>>{
        // Get all key/values as an object
        const items = await this._conn.getAll('dict')
        return items.reduce((obj, item) => {
            obj[item.key] = item.value
            return obj
        }, {} as Record<string, any>)
    }

    async dict_set(key:string, value:any):Promise<void>{
        // Save a key/value in dict table
        await this._conn.put('dict', {key, value})
    }

    async message_set(message:MessageRecord):Promise<void>{
        // Save a message
        await this._conn.put('messages', message)
    }

    async reaction_get(subsect:string):Promise<string|null>{
        // Get reaction by its section/subsection id (uuid so no need to specify which message)
        const result = await this._conn.get('reactions', subsect)
        return result ? result.content : null
    }

    async reaction_set(message:string, section:string, subsection:string|null, content:string,
            ):Promise<void>{
        // Save a reaction
        await this._conn.put('reactions', {
            id: subsection ?? section,
            message,
            section,
            subsection,
            content,
            sent: new Date(),
        })
    }

    async reaction_remove(subsect:string):Promise<void>{
        // Remove a reaction
        await this._conn.delete('reactions', subsect)
    }
}


// Expose only a single instance of the database
export const database = new DisplayerDatabase()

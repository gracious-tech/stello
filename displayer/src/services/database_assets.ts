
import {IDBPTransaction, IDBPDatabase, DBSchema, StoreNames} from 'idb'


export interface DisplayerDatabaseSchema extends DBSchema {

    dict:{
        key:string,  // The type of whatever key is used (defined during upgrade)
        value:{
            key:string,
            value:unknown,
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

    replies:{
        key:string,
        value:{
            id:string,  // Unique per reply
            message:string,
            section:string,  // Must use '' for null as need to index
            subsection:string,  // Must use '' for null as need to index
            sent:Date,
        },
        indexes: {
            by_subsect:[string, string, string],
        },
    },
}


export interface MessageRecord {
    id:string
    secret_url64:string  // Safari is buggy when storing CryptoKey in db, so store as string
    title:string
    published:Date
}


type VersionChangeTransaction = IDBPTransaction<
    DisplayerDatabaseSchema,
    StoreNames<DisplayerDatabaseSchema>[],
    'versionchange'
>


export async function upgrade_database(db:IDBPDatabase<DisplayerDatabaseSchema>, old_version:number,
        transaction:VersionChangeTransaction):Promise<void>{
    // WARN Always await db methods to prevent overlap, but never anything else (transaction closes)
    if (old_version < 1){
        db.createObjectStore('dict', {keyPath: 'key'})
        db.createObjectStore('messages', {keyPath: 'id'})
        db.createObjectStore('reactions', {keyPath: 'id'})
        const replies = db.createObjectStore('replies', {keyPath: 'id'})
        replies.createIndex('by_subsect', ['message', 'section', 'subsection'])
    }
}

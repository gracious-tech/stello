// Migrations use fallthrough switch
/* eslint-disable no-fallthrough */

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
    secret:CryptoKey
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
    // WARN Do not await anything except db methods, as transaction will close
    switch (old_version){
        default: {
            throw new Error("Database version unknown (should never happen)")
        }
        case 0: {  // Version number when db doesn't exist
            db.createObjectStore('dict', {keyPath: 'key'})
            db.createObjectStore('messages', {keyPath: 'id'})
        }
        case 1: {
            db.createObjectStore('reactions', {keyPath: 'id'})
            const replies = db.createObjectStore('replies', {keyPath: 'id'})
            replies.createIndex('by_subsect', ['message', 'section', 'subsection'])
        }
        case 2: {
            // Published values were being incorrectly stored as strings
            // NOTE `for await` not supported by vite when targeting older browsers
            await (async () => {
                let cursor = await transaction.objectStore('messages').openCursor()
                while (cursor){
                    cursor.value.published = new Date(cursor.value.published)
                    void cursor.update(cursor.value)
                    cursor = await cursor.continue()  // null when no more records
                }
            })()
            // Last read now a single id rather than object
            const last_read = await transaction.objectStore('dict').get('last_read')
            if (last_read){
                void transaction.objectStore('dict').put({
                    key: 'last_read',
                    value: (last_read.value as {id:string}).id,
                })
            }
        }
    }
}

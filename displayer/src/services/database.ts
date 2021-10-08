
import {openDB, IDBPDatabase} from 'idb'

import {DisplayerDatabaseSchema, upgrade_database, MessageRecord} from './database_assets'
import {generate_token} from './utils/crypt'


const DATABASE_VERSION = 3


class DisplayerDatabase {

    _conn!: IDBPDatabase<DisplayerDatabaseSchema>

    async connect():Promise<void>{
        // Init connection to the database
        // WARN May be called again if connection terminated
        this._conn = await openDB<DisplayerDatabaseSchema>('stello', DATABASE_VERSION, {
            upgrade(db, old_version, new_version, transaction){
                void upgrade_database(db, old_version, transaction)
            },
            blocked(){
                // Will soon unblock after other pages refresh...
                console.info("Database upgrade blocked (probably already resolved)")
            },
            blocking(){
                // If blocking an upgrade, reload to unblock
                self.location.reload()
            },
            terminated: () => {
                // Some browsers (especially Safari) close connection after a time
                void this.connect()
            },
        }).catch(error => {
            // Firefox doesn't support indexeddb in some cases, so return dummy connection instead
            console.error(error)
            console.error("Database unavailable")
            return {
                /* eslint-disable @typescript-eslint/require-await -- async to mimic original */
                get: async () => undefined,
                getAll: async () => [],
                getAllFromIndex: async () => [],
                put: async () => undefined,
                delete: async () => undefined,
                /* eslint-enable @typescript-eslint/require-await */
            } as unknown as IDBPDatabase<DisplayerDatabaseSchema>
        })
    }

    async dict_get(key:string):Promise<unknown>{
        // Get the value from dict table for given key
        const obj = await this._conn.get('dict', key)
        return obj ? obj.value : null
    }

    async dict_get_all():Promise<Record<string, unknown>>{
        // Get all key/values as an object
        const items = await this._conn.getAll('dict')
        return items.reduce((obj, item) => {
            obj[item.key] = item.value
            return obj
        }, {} as Record<string, unknown>)
    }

    async dict_set(key:string, value:unknown):Promise<void>{
        // Save a key/value in dict table
        await this._conn.put('dict', {key, value})
    }

    async message_set(message:MessageRecord):Promise<void>{
        // Save a message
        await this._conn.put('messages', message)
    }

    async message_get_all():Promise<MessageRecord[]>{
        // Get all message history, sorted by pub date
        const messages = await this._conn.getAll('messages')
        messages.sort((a, b) => a.published.getTime() - b.published.getTime())
        return messages
    }

    async reaction_get(subsect:string):Promise<string|null>{
        // Get reaction by its section/subsection id (uuid so no need to specify which message)
        const result = await this._conn.get('reactions', subsect)
        return result ? result.content : null
    }

    async reaction_set(message:string, section:string, subsection:string|null,
            content:string):Promise<void>{
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

    async reply_list(message:string, section:string|null, subsection:string|null):Promise<Date[]>{
        // Get dates of replies for subsect
        const result = await this._conn.getAllFromIndex('replies', 'by_subsect',
            [message, section ?? '', subsection ?? ''])
        const dates = result.map(item => item.sent)
        dates.sort((a, b) => a.getTime() - b.getTime())
        return dates
    }

    async reply_add(message:string, section:string|null, subsection:string|null):Promise<void>{
        // Add a record of a reply
        await this._conn.put('replies', {
            id: generate_token(),
            message,
            section: section ?? '',  // Must not store null as need to index
            subsection: subsection ?? '',  // Must not store null as need to index
            sent: new Date(),
        })
    }
}


// Expose only a single instance of the database
export const database = new DisplayerDatabase()

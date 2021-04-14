
import {addDays, differenceInDays} from 'date-fns'

import {enforce_range} from '../utils/numbers'
import {AppDatabaseConnection, RecordMessage, RecordDraft} from './types'


export class Message implements RecordMessage {

    id:string
    published:Date
    expired:boolean
    draft:RecordDraft
    assets_key:CryptoKey
    assets_uploaded:{[id:string]:boolean}
    lifespan:number
    max_reads:number

    constructor(db_object:RecordMessage){
        Object.assign(this, db_object)
    }

    get display():string{
        // Return string for displaying message (that will never be blank)
        return this.draft.title.trim() || "[Untitled]"
    }

    get safe_max_reads():number{
        // Ensure max reads is always at least 1 (may be Infinity)
        return Math.max(1, this.max_reads)
    }

    get safe_lifespan():number{
        // Safe version of lifespan that ensures it is always valid
        if (this.lifespan === Infinity){
            return Infinity
        }
        // Any limited lifespan must be 1-365, otherwise it won't match an AWS tag and won't apply
        return enforce_range(this.lifespan, 1, 365)
    }

    get safe_lifespan_remaining():number{
        // Get the lifespan still remaining
        // WARN This is always minimum 1 to ensure matches an AWS tag (check `expired` beforehand)
        return Math.max(1, this.safe_lifespan - differenceInDays(new Date(), this.published))
    }

    get expires():Date{
        // Get approximate date of expiry (as server may not delete within same minutes/hours)
        return this.safe_lifespan === Infinity ? null : addDays(this.published, this.safe_lifespan)
    }

    get probably_expired():boolean{
        // Whether this message has probably expired (may or may not know for sure yet)
        if (this.expired){
            return true  // Have confirmed with server that it's gone
        }
        if (this.expires === null){
            return false
        }
        return this.expires.getTime() - new Date().getTime() <= 0
    }
}


export class DatabaseMessages {

    _conn:AppDatabaseConnection

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
    }

    async list():Promise<Message[]>{
        // Get all messages
        return (await this._conn.getAll('messages')).map(message => new Message(message))
    }

    async get(id:string):Promise<Message>{
        // Get single message by id
        const message = await this._conn.get('messages', id)
        return message && new Message(message)
    }

    async set(message:Message):Promise<void>{
        // Insert or update given message
        await this._conn.put('messages', message)
    }

    async remove(id:string):Promise<void>{
        // Remove the message with given id (and its sections and copies and reads)

        // Start transaction and get stores
        const transaction = this._conn.transaction(['messages', 'sections', 'copies', 'reads'],
            'readwrite')
        const store_messages = transaction.objectStore('messages')
        const store_sections = transaction.objectStore('sections')
        const store_copies = transaction.objectStore('copies')
        const store_reads = transaction.objectStore('reads')

        // Remove message's reads
        for (const read_id of await store_reads.index('by_msg').getAllKeys(id)){
            store_reads.delete(read_id)
        }

        // Remove message's copies
        for (const copy_id of await store_copies.index('by_msg').getAllKeys(id)){
            store_copies.delete(copy_id)
        }

        // Get the message's sections and remove them
        const section_ids = (await store_messages.get(id)).draft.sections.flat()
        for (const section_id of section_ids){
            store_sections.delete(section_id)
        }

        // Remove the message
        store_messages.delete(id)

        // Task done when transaction completes
        await transaction.done
    }
}

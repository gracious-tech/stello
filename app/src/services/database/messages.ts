
import {addDays, differenceInDays} from 'date-fns'

import {enforce_range} from '../utils/numbers'
import {AppDatabaseConnection, RecordMessage, RecordDraft} from './types'


export class Message implements RecordMessage {

    id:string
    published:Date
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

    get expired():boolean{
        // Whether this message has expired
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
}

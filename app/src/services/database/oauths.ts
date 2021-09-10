
import {AppDatabaseConnection, RecordOAuth} from './types'
import {generate_token} from '@/services/utils/crypt'
import {capitalize} from 'lodash'


export class OAuth implements RecordOAuth {

    id!:string
    issuer!:'google'|'microsoft'
    issuer_id!:string
    issuer_config!:Record<string, unknown>
    email!:string
    name!:string
    scope_sets!:('email_send'|'contacts')[]
    token_refresh!:string
    token_access!:string
    token_access_expires!:Date|null
    contacts_sync!:boolean
    contacts_sync_last!:Date
    contacts_sync_token!:string

    constructor(db_object:RecordOAuth){
        Object.assign(this, db_object)
    }

    get display():string{
        return this.email || this.issuer_id
    }

    get display_issuer():string{
        return capitalize(this.issuer)
    }

    get service_account():string{
        // Get combination of issuer:issuer_id to identify the account linked to this auth
        return `${this.issuer}:${this.issuer_id}`
    }
}


export class DatabaseOAuths {

    _conn:AppDatabaseConnection

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
    }

    async list():Promise<OAuth[]>{
        // Get all oauths
        return (await this._conn.getAll('oauths')).map(oauth => new OAuth(oauth))
    }

    async get(id:string):Promise<OAuth|undefined>{
        // Get single oauth by id
        const oauth = await this._conn.get('oauths', id)
        return oauth && new OAuth(oauth)
    }

    async get_by_issuer_id(issuer:string, issuer_id:string):Promise<OAuth|undefined>{
        // Get single oauth record by issuer id
        const oauth = await this._conn.getFromIndex('oauths', 'by_issuer_id', [issuer, issuer_id])
        return oauth && new OAuth(oauth)
    }

    async set(oauth:RecordOAuth):Promise<void>{
        // Insert or update oauth
        await this._conn.put('oauths', oauth)
    }

    async create(all_except_id:Omit<RecordOAuth, 'id'>):Promise<OAuth>{
        // Create a new oauth
        const oauth = new OAuth({
            ...all_except_id,
            id: generate_token(),
        })
        await this._conn.add('oauths', oauth)
        return oauth
    }

    async remove(id:string):Promise<void>{
        // Remove the oauth record
        await this._conn.delete('oauths', id)
    }
}

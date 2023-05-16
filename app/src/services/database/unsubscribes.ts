
import {AppDatabaseConnection, RecordUnsubscribe} from './types'


export class Unsubscribe implements RecordUnsubscribe {

    profile!:string
    contact!:string
    sent!:Date
    ip!:string|null
    user_agent!:string|null

    constructor(db_object:RecordUnsubscribe){
        Object.assign(this, db_object)
    }
}


export class DatabaseUnsubscribes {

    _conn:AppDatabaseConnection

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
    }

    async list_for_profile(profile:string):Promise<Unsubscribe[]>{
        // Get all unsubscribes for given profile id
        const unsubscribes = await this._conn.getAllFromIndex('unsubscribes', 'by_profile', profile)
        return unsubscribes.map(unsubscribe => new Unsubscribe(unsubscribe))
    }

    async list_for_contact(contact:string):Promise<Unsubscribe[]>{
        // Get all unsubscribes for given contact id
        const unsubscribes = await this._conn.getAllFromIndex('unsubscribes', 'by_contact', contact)
        return unsubscribes.map(unsubscribe => new Unsubscribe(unsubscribe))
    }

    async set(unsubscribe:RecordUnsubscribe):Promise<void>{
        // Insert or update given unsubscribe
        await this._conn.put('unsubscribes', unsubscribe)
    }

    async remove(profile:string, contact:string):Promise<void>{
        // Remove the unsubscribe record
        await this._conn.delete('unsubscribes', [profile, contact])
    }
}

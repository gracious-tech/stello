
import {generate_token} from '@/services/utils/crypt'
import {AppDatabaseConnection, RecordSubscribeForm} from './types'


export class SubscribeForm implements RecordSubscribeForm {

    id!:string
    profile!:string
    text!:string
    accept_message!:boolean
    groups!:string[]
    service_account!:string|null

    constructor(db_object:RecordSubscribeForm){
        Object.assign(this, db_object)
    }
}


export class DatabaseSubscribeForms {

    _conn:AppDatabaseConnection

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
    }

    async list_for_profile(profile:string):Promise<SubscribeForm[]>{
        // Get all subscribe_forms belonging to given profile
        const forms = await this._conn.getAllFromIndex('subscribe_forms', 'by_profile', profile)
        return forms.map(subscribe_form => new SubscribeForm(subscribe_form))
    }

    async get(id:string):Promise<SubscribeForm|undefined>{
        // Get single subscribe_form by id
        const subscribe_form = await this._conn.get('subscribe_forms', id)
        return subscribe_form && new SubscribeForm(subscribe_form)
    }

    async set(subscribe_form:RecordSubscribeForm):Promise<void>{
        // Insert or update given subscribe_form
        await this._conn.put('subscribe_forms', subscribe_form)
    }

    async create(profile:string):Promise<SubscribeForm>{
        // Create a new form
        const form = new SubscribeForm({
            id: generate_token(),
            profile,
            text: '<h2>Subscribe to newsletter</h2>\n<p>To get our latest news.</p>',
            accept_message: false,
            groups: [],
            service_account: null,
        })
        await this._conn.add('subscribe_forms', form)
        return form
    }

    async remove(id:string):Promise<void>{
        // Remove the subscribe_form with given id
        await this._conn.delete('subscribe_forms', id)
    }
}

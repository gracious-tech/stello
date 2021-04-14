
import {AppDatabaseConnection, RecordSection, RecordSectionContent, ContentText} from './types'
import {generate_token} from '@/services/utils/crypt'


export class Section<TContent extends RecordSectionContent=RecordSectionContent>
        implements RecordSection<TContent> {

    id:string
    respondable:boolean
    content:TContent

    constructor(db_object:RecordSection){
        Object.assign(this, db_object)
    }

    get is_plain_text():boolean{
        // Boolean for whether section is text without any standout
        return this.content.type === 'text' && !(this.content as ContentText).standout
    }
}


export class DatabaseSections {

    _conn:AppDatabaseConnection

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
    }

    async get(id:string):Promise<Section>{
        // Get single section by id
        const section = await this._conn.get('sections', id)
        return section && new Section(section)
    }

    async get_multiple(ids:string[]):Promise<Section[]>{
        // Return array of sections
        return Promise.all(
            ids.map(async s => new Section(await this._conn.get('sections', s))),
        )
    }

    async set(section:RecordSection):Promise<void>{
        // Insert or update given section
        await this._conn.put('sections', section)
    }

    async create_object(content:RecordSectionContent):Promise<Section>{
        // Create new section object
        // WARN copying drafts assumes all properties copyable and id is from `generate_token()`
        return new Section({
            id: generate_token(),
            respondable: null,
            content,
        })
    }

    async create(content:RecordSectionContent):Promise<Section>{
        // Create new section and save to db
        const section = await this.create_object(content)
        this._conn.put('sections', section)
        return section
    }

    async remove(id:string):Promise<void>{
        // Remove the section with given id
        // NOTE This assumes that the section id will be removed from draft/message manually
        await this._conn.delete('sections', id)
    }
}

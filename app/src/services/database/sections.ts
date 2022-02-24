
import {AppDatabaseConnection, RecordSection, RecordSectionContent} from './types'
import {generate_token} from '@/services/utils/crypt'


export class Section<TContent extends RecordSectionContent=RecordSectionContent>
        implements RecordSection<TContent> {

    id!:string
    respondable!:boolean
    content!:TContent

    constructor(db_object:RecordSection){
        Object.assign(this, db_object)
    }

    get respondable_final():boolean{
        // Respondable value that has converted null to true/false depending on different factors
        if (this.respondable !== null){
            return this.respondable
        }
        if (this.content.type === 'text'){
            const standout = this.content.standout
            if (standout === 'subtle' || standout === 'important'){
                return false  // Subtle and important unlikely to be appropriate for comments
            }
            if (this.content.html.length < 250){  // NOTE Includes html markup
                return false  // Short sections unlikely appropriate for comments
            }
        }
        return true
    }

    get is_plain_text():boolean{
        // Boolean for whether section is text without any standout
        return this.content.type === 'text' && !this.content.standout
    }
}


export class DatabaseSections {

    _conn:AppDatabaseConnection

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
    }

    async get(id:string):Promise<Section|undefined>{
        // Get single section by id
        const section = await this._conn.get('sections', id)
        return section && new Section(section)
    }

    async get_multiple(ids:string[]):Promise<Section[]>{
        // Return array of sections
        return Promise.all(
            ids.map(async s => new Section((await this._conn.get('sections', s))!)),
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

    async create(type:RecordSectionContent['type']):Promise<Section>{
        // Create new section and save to db

        // Content will vary by type
        let content:RecordSectionContent
        if (type === 'text'){
            content = {
                type,
                standout: null,
                html: '',
            }
        } else if (type === 'images'){
            content = {
                type,
                images: [],
                crop: true,
            }
        } else if (type === 'video'){
            content = {
                type,
                format: null,
                id: null,
                caption: '',
                start: null,
                end: null,
            }
        } else if (type === 'page'){
            content = {
                type,
                headline: '',
                desc: '',
                image: null,
                sections: [],
            }
        } else {
            throw new Error('invalid_type')
        }

        const section = await this.create_object(content)
        void this._conn.put('sections', section)
        return section
    }

    async remove(id:string):Promise<void>{
        // Remove the section with given id
        // NOTE This assumes that the section id will be removed from draft/message manually
        await this._conn.delete('sections', id)
    }
}

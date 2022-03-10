
import {IDBPObjectStore} from 'idb'

import {AppDatabaseConnection, RecordSection, RecordSectionContent, SectionIds,
    AppDatabaseSchema} from './types'
import {generate_token} from '@/services/utils/crypt'


export class Section<TContent
        extends RecordSectionContent=RecordSectionContent> implements RecordSection<TContent> {

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
        if (this.is_hero){
            return false  // Hero images usually decorative or section dividers rather than content
        }
        return true
    }

    get is_plain_text():boolean{
        // Boolean for whether section is text without any standout
        return this.content.type === 'text' && !this.content.standout
    }

    get is_hero():boolean{
        // Whether section is an image hero
        return this.content.type === 'images' && this.content.images.length === 1
            && this.content.hero
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
                hero: false,
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
                button: false,
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
        const transaction = this._conn.transaction('sections', 'readwrite')
        void rm_sections(transaction.objectStore('sections'), [[id]])
        await transaction.done
    }
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any -- other stores may be open too
type SectionsStore = IDBPObjectStore<AppDatabaseSchema, any, 'sections', 'readwrite'>


export async function rm_sections(sections_store:SectionsStore, section_ids:SectionIds){
    // Recursive helper for deleting sections which traverses pages
    // NOTE Expects to be provided an object store from an ongoing transaction
    for (const section_id of section_ids.flat()){
        void sections_store.get(section_id).then(section => {
            if (section?.content.type === 'page'){
                void rm_sections(sections_store, section.content.sections)
            }
            void sections_store.delete(section_id)
        })
    }
}


export async function copy_sections(sections_store:SectionsStore, section_ids:SectionIds){
    // Recursively copy given sections and return ids of the copies
    return Promise.all(section_ids.map(row => {
        return Promise.all(row.map(async old_id => {
            const section = (await sections_store.get(old_id))!
            section.id = generate_token()  // Change id of the section
            if (section.content.type === 'page'){
                section.content.sections =
                    await copy_sections(sections_store, section.content.sections)
            }
            void sections_store.put(section)  // Save to db under the new id
            return section.id  // Replace old id in the sections nested array
        }))
    })) as Promise<SectionIds>
}

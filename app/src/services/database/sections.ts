
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
            if (this.content.standout === 'important'){
                return false  // Important unlikely to be appropriate for comments
            }
            if (this.content.html.length < 250){  // NOTE Includes html markup
                return false  // Short sections unlikely appropriate for comments
            }
        } else if (this.content.type === 'files'){
            return false  // Files open externally so not natural to go back and comment on
        } else if (this.content.type === 'images' && this.is_hero){
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

    get files_download():boolean|null{
        // Whether files type should download file or open it in a tab
        // NOTE Currently only supporting "open" option for PDFs
        //      Images/videos/etc can be embedded in message, and anything else likely unopenable
        if (this.content.type !== 'files'){
            return null
        }
        return this.content.files.length !== 1 ||
            this.content.files[0]!.data.type !== 'application/pdf'
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
        } else if (type === 'chart'){
            content = {
                type,
                chart: 'bar',
                data: [
                    // Start with some data so chart is actually visible and type choice meaningful
                    {label: '', number: '60%', hue: 150},  // Auto-picker increments by +150
                    {label: '', number: '30%', hue: 300},
                ],
                threshold: '100%',
                title: '',
                caption: '',
            }
        } else if (type === 'files'){
            content = {
                type,
                files: [],
                label: '',
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

    async remove(id:string):Promise<RecordSection[]>{
        // Remove the section with given id and return it and all connected subsections
        // WARN callers expect first section of returned array to be the one identified by given id
        const transaction = this._conn.transaction('sections', 'readwrite')
        const removed = await rm_sections(transaction.objectStore('sections'), [[id]])
        await transaction.done
        return removed
    }
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any -- other stores may be open too
type SectionsStore = IDBPObjectStore<AppDatabaseSchema, any, 'sections', 'readwrite'>


export async function rm_sections(sections_store:SectionsStore, section_ids:SectionIds){
    // Recursive helper for deleting sections which traverses pages
    // NOTE Expects to be provided an object store from an ongoing transaction

    // Collect all section records that are removed so can later return them
    const removed:RecordSection[] = []

    // Can process each id concurrently but must wait for all to finish so removed array populated
    // NOTE order added to removed matters to DatabaseSections.remove() but only 1 item in that case
    await Promise.all(section_ids.flat().map(async section_id => {

        // Get and remove section
        const section = (await sections_store.get(section_id))!
        removed.push(section)
        void sections_store.delete(section_id)  // Can wait on transaction later if needed

        // See if need to recurse through subpages
        if (section.content.type === 'page'){
            removed.push(... await rm_sections(sections_store, section.content.sections))
        }
    }))

    return removed
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

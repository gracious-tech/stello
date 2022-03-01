
import {SectionIds} from '@/services/database/types'
import {remove_item} from '@/services/utils/arrays'


export function rm_section_id(sections:SectionIds, id:string){
    // Remove a section id from nested array by modifying it in-place
    for (let i=0; i < sections.length; i++){
        const row = sections[i]!
        if (remove_item(row, id)){
            // Item existed
            if (!row.length){
                // If row empty, section was last in row and whole row must be deleted
                sections.splice(i, 1)
            }
            return
        }
    }
    throw new Error('section_id_not_found')
}

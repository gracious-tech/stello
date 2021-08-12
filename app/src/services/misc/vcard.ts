
import {partition} from '@/services/utils/strings'


interface Contact {
    name?:string
    email?:string
}


export function extract_contacts_from_vcard(data:string):Contact[]{
    // Simple vcard parsing which gets name and/or email only (skips if neither)

    const contacts:Contact[] = []

    let within_card = false
    let name:string = null
    let email:string = null

    for (let line of data.split('\n')){

        line = line.trim()

        if (line === 'BEGIN:VCARD'){
            within_card = true
            continue
        }

        if (!within_card){
            continue
        }

        if (line === 'END:VCARD'){
            if (name || email){
                contacts.push({name, email})
            }
            within_card = false
            name = null
            email = null
            continue
        }

        if (line.startsWith('FN:') || line.startsWith('FN;')){
            // NOTE vcard escapes commas with backlash for any field (not just ones with lists)
            name = partition(line, ':')[1].replaceAll('\\,', ',')
            continue
        }

        if (line.startsWith('EMAIL:') || line.startsWith('EMAIL;')){
            // NOTE Google/others? indicate pref by order (coming first) rather than vCard PREF arg
            if (!email){
                email = partition(line, ':')[1]
            }
            continue
        }
    }

    return contacts
}

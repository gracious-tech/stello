
import {partition} from '@/services/utils/strings'


interface Contact {
    name:string|null
    email:string|null
    notes:string|null
}


export function extract_contacts_from_vcard(data:string):Contact[]{
    // Simple vcard parsing which gets name and/or email only (skips if neither) + optionally notes

    const contacts:Contact[] = []

    let within_card = false
    let name:string|null = null
    let email:string|null = null
    let notes:string|null = null

    for (let line of data.split('\n')){

        // Extract key and val from line
        // Must account for eg: group1.EMAIL;TYPE=INTERNET:user@localhost
        line = line.trim()
        let [key, val] = partition(line, ':')
        key = partition(key, ';')[0].split('.').at(-1) ?? ''
        // NOTE vcard escapes commas with backlash for any field (not just ones with lists)
        val = val.replaceAll('\\,', ',')

        if (line === 'BEGIN:VCARD'){
            within_card = true
            continue
        }

        if (!within_card){
            continue
        }

        if (line === 'END:VCARD'){
            if (name || email){
                contacts.push({name, email, notes})
            }
            within_card = false
            name = null
            email = null
            notes = null
            continue
        }

        if (key === 'FN'){
            name = val
            continue
        }

        if (key === 'EMAIL'){
            // NOTE Google/others? indicate pref by order (coming first) rather than vCard PREF arg
            if (!email){
                email = val
            }
            continue
        }

        if (key === 'NOTE'){
            notes = val
            continue
        }
    }

    return contacts
}

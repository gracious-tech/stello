// NOTE Imports avoided so no issues with Playwright using different tsconfig

import {remove_value} from '../utils/arrays'


// Partial interfaces to specify minimum fields required for functionality and testing

export interface PartialDraft {
    profile:string|null
    recipients:{
        include_contacts:string[]
        include_groups:string[]
        exclude_contacts:string[]
        exclude_groups:string[]
    }
}

export interface PartialContact {
    id:string
    address:string
}

export interface PartialGroup {
    id:string
    contacts:string[]
}

export interface PartialUnsubscribe {
    profile:string
    contact:string
}


export function get_final_recipients(draft:PartialDraft, contacts:PartialContact[],
        groups:PartialGroup[], unsubscribes:PartialUnsubscribe[]):string[]{
    // Return array of contact ids to send to after accounting for all includes/excludes
    const recipients:string[] = []

    // Create a mapping of group ids to their contacts
    const groups_dict:Record<string, string[]> = {
        all: contacts.map(contact => contact.id),
    }
    for (const group of groups){
        groups_dict[group.id] = group.contacts
    }

    // Add all contacts included by groups
    for (const group_id of draft.recipients.include_groups){
        if (group_id in groups_dict){  // WARN Group may no longer exist
            // WARN Can easily result in duplicate ids, which will be filtered out later
            recipients.push(...groups_dict[group_id]!)
        }
    }

    // Remove all contacts excluded by groups
    for (const group_id of draft.recipients.exclude_groups){
        if (group_id in groups_dict){  // WARN Group may no longer exist
            for (const contact_id of groups_dict[group_id]!){
                // WARN May need to remove duplicates, so search whole array
                remove_value(recipients, contact_id)
            }
        }
    }


    // Remove all contacts who have unsubscribed (only applies to group inclusions)
    for (const unsub of unsubscribes){
        if (unsub.profile === draft.profile){
            // WARN May need to remove duplicates, so search whole array
            remove_value(recipients, unsub.contact)
        }
    }

    // Add all contacts included explicitly (overrides group exclude & unsubscribes)
    recipients.push(...draft.recipients.include_contacts)

    // Remove all contacts excluded explicitly (overrides all)
    for (const contact_id of draft.recipients.exclude_contacts){
        remove_value(recipients, contact_id)  // WARN Must search whole array in case duplicates
    }

    // Deduplicate (both ids and addresses)
    const address_map = Object.fromEntries(contacts.map(c => [c.id, c.address?.trim()]))
    const included_ids = new Set()
    const included_addresses = new Set()
    return recipients.filter(id => {
        // Filter out deleted contacts and duplicate inclusions
        if (!(id in address_map) || included_ids.has(id)){
            return false
        }
        included_ids.add(id)
        // Filter out duplicate addresses
        if (address_map[id]){
            if (included_addresses.has(address_map[id])){
                return false
            }
            included_addresses.add(address_map[id])
        }
        return true
    })
}

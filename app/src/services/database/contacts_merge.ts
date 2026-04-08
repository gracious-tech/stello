
import {AppDatabaseConnection, RecordContact} from './types'


export async function merge_contacts(conn:AppDatabaseConnection, primary_id:string,
        secondary_ids:string[]):Promise<void>{
    // Merge secondary contacts into primary, repointing all references across every store
    // NOTE Service account contact records are never modified; only internal references change

    const secondary_set = new Set(secondary_ids)

    // Open a single transaction covering every store that holds contact references
    const transaction = conn.transaction(
        ['contacts', 'groups', 'drafts', 'messages', 'copies', 'replies', 'reactions',
            'unsubscribes', 'request_address', 'request_resend'],
        'readwrite')
    const store_contacts = transaction.objectStore('contacts')
    const store_groups = transaction.objectStore('groups')
    const store_drafts = transaction.objectStore('drafts')
    const store_messages = transaction.objectStore('messages')
    const store_copies = transaction.objectStore('copies')
    const store_replies = transaction.objectStore('replies')
    const store_reactions = transaction.objectStore('reactions')
    const store_unsubs = transaction.objectStore('unsubscribes')
    const store_req_addr = transaction.objectStore('request_address')
    const store_req_resend = transaction.objectStore('request_resend')

    // Load primary and secondary contact records
    const primary = await store_contacts.get(primary_id)
    if (!primary){
        return
    }
    const secondaries:RecordContact[] = []
    for (const id of secondary_ids){
        const contact = await store_contacts.get(id)
        if (contact){
            secondaries.push(contact)
        }
    }

    // Merge notes into primary (only if primary is internal; only from internal secondaries)
    // Service account contacts have synced notes that shouldn't be mixed into local data
    if (!primary.service_account){
        const internal_notes = secondaries.filter(c => !c.service_account).map(c => c.notes)
        const all_notes = [primary.notes, ...internal_notes].filter(n => n.trim())
        primary.notes = all_notes.join('\n\n')
        void store_contacts.put(primary)
    }

    // Delete secondary contacts that are internal (service account contacts cannot be deleted)
    for (const contact of secondaries){
        if (!contact.service_account){
            void store_contacts.delete(contact.id)
        }
    }

    // Update groups: replace each secondary id with primary, removing if primary already present
    for (const group of await store_groups.getAll()){
        let changed = false
        for (const id of secondary_ids){
            const idx = group.contacts.indexOf(id)
            if (idx === -1){
                continue
            }
            if (group.contacts.includes(primary_id)){
                group.contacts.splice(idx, 1)
            } else {
                group.contacts[idx] = primary_id
            }
            changed = true
        }
        if (changed){
            void store_groups.put(group)
        }
    }

    // Helper: replace secondary ids in a recipients include/exclude pair, returns true if changed
    const replace_in_recipients = (include:string[], exclude:string[]):boolean => {
        let changed = false
        for (const list of [include, exclude]){
            for (const id of secondary_ids){
                const idx = list.indexOf(id)
                if (idx === -1){
                    continue
                }
                if (list.includes(primary_id)){
                    list.splice(idx, 1)
                } else {
                    list[idx] = primary_id
                }
                changed = true
            }
        }
        return changed
    }

    // Update draft recipients: replace secondary ids in both include and exclude lists
    for (const draft of await store_drafts.getAll()){
        const changed = replace_in_recipients(
            draft.recipients.include_contacts, draft.recipients.exclude_contacts)
        if (changed){
            void store_drafts.put(draft)
        }
    }

    // Update published message draft recipients: the draft is embedded in the message record
    for (const message of await store_messages.getAll()){
        const changed = replace_in_recipients(
            message.draft.recipients.include_contacts, message.draft.recipients.exclude_contacts)
        if (changed){
            void store_messages.put(message)
        }
    }

    // Update copies: replace secondary contact_id with primary
    for (const id of secondary_ids){
        for (const copy of await store_copies.index('by_contact').getAll(id)){
            copy.contact_id = primary_id
            void store_copies.put(copy)
        }
    }

    // Update replies: replace secondary contact_id with primary
    for (const id of secondary_ids){
        for (const reply of await store_replies.index('by_contact').getAll(id)){
            reply.contact_id = primary_id
            void store_replies.put(reply)
        }
    }

    // Update reactions: replace secondary contact_id with primary
    for (const id of secondary_ids){
        for (const reaction of await store_reactions.index('by_contact').getAll(id)){
            reaction.contact_id = primary_id
            void store_reactions.put(reaction)
        }
    }

    // Update unsubscribes: key is [profile, contact], so must delete old and re-add under primary
    const primary_unsub_profiles = new Set(
        (await store_unsubs.index('by_contact').getAll(primary_id)).map(u => u.profile))
    for (const id of secondary_ids){
        for (const unsub of await store_unsubs.index('by_contact').getAll(id)){
            void store_unsubs.delete([unsub.profile, unsub.contact])
            // Skip if primary already has an unsubscribe for this profile
            if (!primary_unsub_profiles.has(unsub.profile)){
                void store_unsubs.add({...unsub, contact: primary_id})
                primary_unsub_profiles.add(unsub.profile)
            }
        }
    }

    // Update request_address: keyPath is 'contact', so delete old and re-add under primary
    // At most one record can exist per contact, so only migrate the first secondary's record
    let primary_has_req_addr = !!(await store_req_addr.get(primary_id))
    for (const id of secondary_ids){
        const req = await store_req_addr.get(id)
        if (req){
            void store_req_addr.delete(id)
            if (!primary_has_req_addr){
                void store_req_addr.add({...req, contact: primary_id})
                primary_has_req_addr = true
            }
        }
    }

    // Update request_resend: key is [contact, message], so delete old and re-add under primary
    const all_req_resend = await store_req_resend.getAll()
    const primary_resend_msgs = new Set(
        all_req_resend.filter(r => r.contact === primary_id).map(r => r.message))
    for (const req of all_req_resend){
        if (secondary_set.has(req.contact)){
            void store_req_resend.delete([req.contact, req.message])
            // Skip if primary already has a resend request for this message
            if (!primary_resend_msgs.has(req.message)){
                void store_req_resend.add({...req, contact: primary_id})
                primary_resend_msgs.add(req.message)
            }
        }
    }

    await transaction.done
}

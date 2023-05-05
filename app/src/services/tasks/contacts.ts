
import {uniq, xor} from 'lodash'

import {Task} from './tasks'
import {OAuth} from '../database/oauths'
import {oauth_request} from './oauth'
import {partition} from '../utils/strings'
import {MustInterpret, MustReauthenticate, MustWait} from '../utils/exceptions'


// Functions which sync contacts in ways specific to the issuer
interface IssuerHandlers {
    sync:typeof contacts_sync_google,
    change_name:typeof contacts_change_name_google,
    change_notes:typeof contacts_change_notes_google,
    change_email:typeof contacts_change_email_google,
    remove:typeof contacts_remove_google,
    get_addresses:typeof contacts_get_addresses_google,
}
const HANDLERS:Record<string, IssuerHandlers> = {
    google: {
        sync: contacts_sync_google,
        change_name: contacts_change_name_google,
        change_notes: contacts_change_notes_google,
        change_email: contacts_change_email_google,
        remove: contacts_remove_google,
        get_addresses: contacts_get_addresses_google,
    },
}


export async function contacts_oauth_setup(task:Task):Promise<void>{
    // A task for enabling contact syncing after auth'ing

    // Set syncing property in db
    // NOTE This isn't done when first receiving new auth, especially when using an existing one
    const [oauth_id] = task.params as [string]
    const oauth = await self.app_db.oauths.get(oauth_id)
    if (!oauth){
        throw task.abort("No longer have access to contacts account")
    }
    oauth.contacts_sync = true
    await self.app_db.oauths.set(oauth)

    // Turn this task into a sync
    await task.evolve(contacts_sync)
}


export async function contacts_sync(task:Task):Promise<void>{
    // Task for syncing contacts

    // Extract args from task object and get oauth record
    const [oauth_id] = task.params as [string]
    let oauth = await self.app_db.oauths.get(oauth_id)
    if (!oauth){
        throw task.abort("No longer have access to contacts account")
    }

    // Configure task object
    task.label = `Syncing contacts for ${oauth.display_issuer} account ${oauth.email}`
    task.show_count = true
    task.fix_oauth = oauth_id

    // Call handler specific to the oauth's issuer
    await HANDLERS[oauth.issuer].sync(task, oauth)

    // Update last synced time
    // NOTE Get fresh copy of oauth in case changed during the sync
    oauth = await self.app_db.oauths.get(oauth_id)
    oauth.contacts_sync_last = new Date()
    await self.app_db.oauths.set(oauth)
}


export async function contacts_change_property(task:Task):Promise<void>{
    // Task for changing a simple property of a contact

    // Extract args from task object and get oauth record
    const [oauth_id, contact_id, property] = task.params as [string, string, string]
    const [value] = task.options
    const oauth = await self.app_db.oauths.get(oauth_id)
    if (!oauth){
        throw task.abort("No longer have access to contacts account")
    }

    // Get the contact's record
    const contact = await self.app_db.contacts.get(contact_id)
    if (!contact){
        throw task.abort("Contact no longer exists")
    }

    // Configure task object
    task.label = `Changing ${property} for "${contact.display}"`
    task.fix_oauth = oauth_id

    // Call handler specific to the oauth's issuer
    await HANDLERS[oauth.issuer][`change_${property}`](oauth, contact.service_id, value)

    // If all went well, update value in own database
    contact[property] = value
    await self.app_db.contacts.set(contact)
}


export async function contacts_change_email(task:Task):Promise<void>{
    // Task for changing email address for a contact (accounting for multiple being present)

    // Extract args from task object and get oauth record
    const [oauth_id, contact_id] = task.params as [string, string]
    const [addresses, chosen] = task.options as [string[], string]
    const oauth = await self.app_db.oauths.get(oauth_id)
    if (!oauth){
        throw task.abort("No longer have access to contacts account")
    }

    // Get the contact's record
    const contact = await self.app_db.contacts.get(contact_id)
    if (!contact){
        throw task.abort("Contact no longer exists")
    }

    // Configure task object
    task.label = `Changing email address for "${contact.display}"`
    task.fix_oauth = oauth_id

    // Call handler specific to the oauth's issuer
    await HANDLERS[oauth.issuer]!.change_email(oauth, contact.service_id!, addresses)

    // If all went well, update value in own database
    contact.address = chosen
    await self.app_db.contacts.set(contact)
}


export async function contacts_remove(task:Task):Promise<void>{
    // Task for removing a contact

    // Extract args from task object and get oauth record
    const [oauth_id, contact_id] = task.params as [string, string]
    const oauth = await self.app_db.oauths.get(oauth_id)
    if (!oauth){
        throw task.abort("No longer have access to contacts account")
    }

    // Get the contact's record
    const contact = await self.app_db.contacts.get(contact_id)
    if (!contact){
        throw task.abort("Contact no longer exists")
    }

    // Configure task object
    task.label = `Deleting contact "${contact.display}"`
    task.fix_oauth = oauth_id

    // Call handler specific to the oauth's issuer
    await HANDLERS[oauth.issuer].remove(oauth, contact.service_id)

    // If all went well, remove contact in own database
    await self.app_db.contacts.remove(contact.id)
}


// NON-TASKS


export async function taskless_contact_addresses(oauth:OAuth, service_id:string):Promise<string[]>{
    // Get all the email addresses currently saved in a contact
    // NOTE Services (like Google) may allow duplicate items, so remove them
    return uniq(await HANDLERS[oauth.issuer].get_addresses(oauth, service_id))
}


// GOOGLE

interface GooglePersonsListResp {
    connections?:GooglePerson[]  // May not exist if none
    nextSyncToken:string
    nextPageToken:string
    totalItems:number
}

interface GooglePerson {
    resourceName:string
    names?:GoogleName[]
    emailAddresses?:GoogleEmail[]
    biographies?:GoogleBio[]
}

interface GoogleGroupsListResp {
    contactGroups:GoogleGroup[]
}

interface GoogleGroupsBatchResp {
    responses:{contactGroup:GoogleGroup}[]
}

interface GoogleGroup {
    resourceName:string
    name:string
    groupType:'USER_CONTACT_GROUP'  // The only relevant one
    memberCount?:number  // Won't exist if 0
    memberResourceNames?:string[]  // Only returned for get requests (not list)
}

interface GoogleName extends GoogleListItem {
    unstructuredName:string
}

interface GoogleEmail extends GoogleListItem {
    value:string
}

interface GoogleBio extends GoogleListItem {
    value:string
    contentType:'TEXT_PLAIN'  // The only one that matters
}

interface GoogleListItem {
    metadata?: {
        primary: boolean,
    }
}


async function google_request(...args:Parameters<typeof oauth_request>):Promise<unknown>{
    // Wrap oauth_request to provide error interpretation

    // Prefix url arg with the common endpoint
    args[1] = `https://people.googleapis.com/v1/${args[1]}`

    // Submit request and return if valid
    const resp = await oauth_request(...args)
    if (resp.ok){
        return resp.json()
    }

    // Can't find documentation, but these are probably safe assumptions
    if (resp.status === 401){
        throw new MustReauthenticate()  // Signed out?
    } else if (resp.status === 403){
        throw new MustReauthenticate()  // Didn't grant required scope?
    } else if (resp.status === 429){
        throw new MustWait()  // Have been rate limited
    } else if (resp.status >= 500 && resp.status < 600){
        throw new MustWait()  // Third-party issue that will probably resolve over time
    }
    throw new MustInterpret({status: resp.status, body: await resp.json() as unknown})
}


async function contacts_sync_google(task:Task, oauth:OAuth):Promise<void>{
    // Sync contacts from a Google account
    let confirmed:Record<string, string>
    if (oauth.contacts_sync_token){
        confirmed = await contacts_sync_google_changes(task, oauth)
    } else {
        confirmed = await contacts_sync_google_full(task, oauth)
    }
    return contacts_sync_google_groups(task, oauth, confirmed)
}


async function contacts_sync_google_changes(task:Task, oauth:OAuth):Promise<Record<string, string>>{
    // Do a sync for the Google account that requests only what has changed rather than all data
    return contacts_sync_google_full(task, oauth)  // TODO
}


async function contacts_sync_google_full(task:Task, oauth:OAuth):Promise<Record<string, string>>{
    // Do a full sync for the Google account, comparing with own existing records

    // Increase subtasks for initial page (better predictions after that)
    task.upcoming(1)

    // Get list of previously synced contacts for account and map by service's ids
    const existing_contacts = await self.app_db.contacts.list_for_account('google', oauth.issuer_id)
    const existing_by_id = Object.fromEntries(existing_contacts.map(c => [c.service_id, c]))

    // Keep track of final confirmed contacts with mapping from service's id to Stello id
    const confirmed:Record<string, string> = {}

    // Download pages of contacts until none left
    const page_size = 100
    let page_token = ''
    while (true){

        // Make request
        // NOTE Page size default is 100, and while could do 1000, less better for progress tracking
        // NOTE May raise MustReconnect or MustReauthenticate, which are handled by task manager
        const resp_data = await task.expected(google_request(oauth, 'people/me/connections', {
            requestSyncToken: 'true',
            personFields: 'names,emailAddresses,biographies',
            pageSize: `${page_size}`,
            pageToken: page_token,
        })) as GooglePersonsListResp

        // Save the contacts
        for (const person of (resp_data.connections ?? [])){

            // Extract relevant data
            const service_id = partition(person.resourceName, '/')[1]  // Google appends 'people/'
            const name = google_primary(person.names)?.unstructuredName?.trim() || ''
            const primary_email = google_primary(person.emailAddresses)?.value?.trim()
            // NOTE Google supports multiple notes, but in UI currently only uses single plain one
            const notes = person.biographies?.find(i => i.contentType === 'TEXT_PLAIN')?.value || ''

            // Ignore contacts without email addresses
            // NOTE If did previously have one that record will be removed in final step
            if (!primary_email){
                continue
            }

            // Either update existing or add new contact
            if (service_id in existing_by_id){
                const existing = existing_by_id[service_id]

                // Don't update address unless gone (doesn't matter if primary status changed)
                // NOTE This allows user to select non-primary address without losing it every sync
                const address_gone = !person.emailAddresses.some(i => i.value === existing.address)

                // Only update if something changed
                if (address_gone || existing.name !== name || existing.notes !== notes){
                    existing.name = name
                    existing.address = address_gone ? primary_email : existing.address
                    existing.notes = notes
                    self.app_db.contacts.set(existing)
                }
                delete existing_by_id[service_id]  // Prevent deletion during final step
                confirmed[existing.service_id] = existing.id
            } else {
                const created = self.app_db.contacts.create_object()
                created.name = name
                created.address = primary_email
                created.notes = notes
                created.service_account = oauth.service_account
                created.service_id = service_id
                void self.app_db.contacts.set(created)
                confirmed[created.service_id] = created.id
            }
        }

        // Check if last page / sync token
        if (resp_data.nextSyncToken){
            // A sync token was returned, so this is the last page
            oauth.contacts_sync_token = resp_data.nextSyncToken
            void self.app_db.oauths.set(oauth)
            break
        }

        // If the first request (page_token not set yet), use to estimate how many to go
        if (!page_token){
            task.upcoming(Math.ceil(resp_data.totalItems / page_size) - 1)
        }

        // Update page token for next request
        page_token = resp_data.nextPageToken
    }

    // Remove any remaining existing contacts since are no longer present in the service
    for (const existing of Object.values(existing_by_id)){
        void self.app_db.contacts.remove(existing.id)
    }

    // Return confirmed ids
    return confirmed
}


async function contacts_sync_google_groups(task:Task, oauth:OAuth,
        confirmed:Record<string, string>):Promise<void>{
    // Sync contact groups from a Google account

    // Get fresh list of the groups
    // NOTE While could use pagination/syncToken, list likely to be very small and not worth it
    const list_resp = await task.add(google_request(oauth, 'contactGroups', {
        groupFields: 'name,groupType,memberCount',
        pageSize: '1000',  // Highest possible and highly unlikely to get anywhere close
    })) as GoogleGroupsListResp

    // Filter out system groups (starred/banned/etc) and empty groups
    const groups = list_resp.contactGroups.filter(
        g => g.groupType === 'USER_CONTACT_GROUP' && g.memberCount)  // memberCount excluded if 0

    // Organise groups into batches depending on how many members (i.e. how large request will be)
    const batches:GoogleGroup[][] = [[]]
    let total_members = 0
    for (const group of groups){
        /* Start new batch if:
            a. Current batch has >= 40 groups already (limit for people.getBatchGet is 50)
            b. Current batch has a group and adding next would put it over the total members limit
        */
        const batch_size = batches[0].length
        if (batch_size >= 40 || (batch_size && total_members + group.memberCount! > 1000)){
            total_members = 0
            batches.unshift([group])
        } else {
            batches[0].push(group)
        }
        total_members += group.memberCount!
    }

    // Update subtasks count since know how many batches there'll be
    task.upcoming(batches.length)

    // Get existing groups from db
    const existing_groups = await self.app_db.groups.list_for_account(oauth.issuer, oauth.issuer_id)
    const existing_by_id = Object.fromEntries(existing_groups.map(g => [g.service_id, g]))

    // Make batch get requests, as members data isn't returned for list requests
    for (const batch of batches){

        // If no groups at all, first batch will be empty
        if (!batch.length){
            continue
        }

        // Do batch request
        const get_resp = await task.expected(google_request(oauth, `contactGroups:batchGet`, {
            resourceNames: batch.map(g => g.resourceName),
            maxMembers: '10000',  // Have to put something...
            groupFields: 'name',  // Don't need any, but defaults to more if none set
        })) as GoogleGroupsBatchResp

        // Process each group now that we have the list of members available
        for (const batch_sub_resp of get_resp.responses){

            // Extract relevant fields
            const service_id = partition(batch_sub_resp.contactGroup.resourceName, '/')[1]
            const name = batch_sub_resp.contactGroup.name || ''
            const members = batch_sub_resp.contactGroup.memberResourceNames.map(
                n => partition(n, '/')[1])

            // Convert array of service's contact ids to Stello ids (and filter out dud members)
            const contacts = members.map(sid => confirmed[sid]).filter(id => id)

            // Ignore (and effectively delete) group if no valid contacts (e.g. none with emails)
            if (!contacts.length){
                continue
            }

            // Either update existing or add new group
            if (service_id in existing_by_id){
                const existing = existing_by_id[service_id]
                existing.name = name
                existing.contacts = contacts
                self.app_db.groups.set(existing)
                delete existing_by_id[service_id]  // Prevent deletion during final step
            } else {
                self.app_db.groups.create(name, contacts, `google:${oauth.issuer_id}`, service_id)
            }
        }
    }

    // Remove any remaining existing groups since are no longer present in the service
    for (const existing of Object.values(existing_by_id)){
        void self.app_db.groups.remove(existing.id)
    }
}


function google_primary<T extends GoogleListItem>(options?:T[]):T|undefined{
    // Helper for Google data structures that selects either the primary item, else the first one
    if (!options?.length){
        return undefined // options may be undefined or empty if data wasn't returned by Google
    }
    for (const item of options){
        if (item.metadata.primary){
            return item
        }
    }
    return options[0]
}


async function contacts_change_name_google(oauth:OAuth, service_id:string, value:string)
        :Promise<void>{
    // Change the name of a contact in Google Contacts

    // Get fresh copy of the person from Google (also need etag to be able to patch)
    const person =
        await google_request(oauth, `people/${service_id}`, {personFields: 'names'}) as GooglePerson

    // Overwrite any existing names
    person.names = [{unstructuredName: value}]

    // Submit request
    await google_request(oauth, `people/${service_id}:updateContact`,
        {updatePersonFields: 'names', personFields: ''}, 'PATCH', person)
}


async function contacts_change_notes_google(oauth:OAuth, service_id:string, value:string)
        :Promise<void>{
    // Change the notes of a contact in Google Contacts

    // Get fresh copy of the person from Google (also need etag to be able to patch)
    const person = await google_request(
        oauth, `people/${service_id}`, {personFields: 'biographies'}) as GooglePerson

    // Keep any existing html/other notes, but overwrite any existing plain text
    person.biographies = person.biographies?.filter(i => i.contentType !== 'TEXT_PLAIN') ?? []
    person.biographies.push({contentType: 'TEXT_PLAIN', value})

    // Submit request
    await google_request(oauth, `people/${service_id}:updateContact`,
        {updatePersonFields: 'biographies', personFields: ''}, 'PATCH', person)
}


async function contacts_change_email_google(oauth:OAuth, service_id:string, addresses:string[])
        :Promise<void>{
    // Change the email addresses of a contact in Google Contacts

    // Get fresh copy of the person from Google (also need etag to be able to patch)
    const person = await google_request(
        oauth, `people/${service_id}`, {personFields: 'emailAddresses'}) as GooglePerson

    // Ensure emailAddresses exists
    if (!person.emailAddresses){
        person.emailAddresses = []
    }

    // May not need to do anything if user didn't add/remove any address (just chose from existing)
    const person_address_values = person.emailAddresses.map(i => i.value)
    if (xor([person_address_values, addresses]).length === 0){
        return
    }

    // Remove addresses no longer desired
    // NOTE Other fields (like displayName) may exist and so be careful to preserve where possible
    person.emailAddresses = person.emailAddresses.filter(i => addresses.includes(i.value))

    // Insert any new addresses
    for (const address of addresses){
        if (!person_address_values.includes(address)){
            person.emailAddresses.push({value: address})
        }
    }

    // Submit request
    await google_request(oauth, `people/${service_id}:updateContact`,
        {updatePersonFields: 'emailAddresses', personFields: ''}, 'PATCH', person)
}


async function contacts_remove_google(oauth:OAuth, service_id:string):Promise<void>{
    // Remove the given contact in Google Contacts
    await google_request(oauth, `people/${service_id}:deleteContact`, undefined, 'DELETE')
}


async function contacts_get_addresses_google(oauth:OAuth, service_id:string):Promise<string[]>{
    // Get all email addresses for a Google contact
    const person = await google_request(
        oauth, `people/${service_id}`, {personFields: 'emailAddresses'}) as GooglePerson
    return person.emailAddresses?.map(i => i.value) ?? []
}

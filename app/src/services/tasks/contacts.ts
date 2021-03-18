
import {Task} from "./tasks"
import {OAuth} from "../database/oauths"
import {oauth_request} from "../oauth"
import {partition} from "../utils/strings"


// Functions which sync contacts in ways specific to the issuer
const handlers:{[issuer:string]:(task:Task, oauth:OAuth)=>Promise<void>} = {
    google: contacts_sync_google,
}


export async function contacts_sync(task:Task):Promise<void>{
    // Task for syncing contacts

    // Extract args from task object and get oauth record
    const [oauth_id] = task.params
    const oauth = await self._db.oauths.get(oauth_id)

    // Configure task object
    task.label = `Syncing contacts for ${oauth.display_issuer} account ${oauth.email}`
    task.show_count = true
    task.fix_oauth = oauth

    // Call handler specific to the oauth's issuer
    return handlers[oauth.issuer](task, oauth)
}


// GOOGLE


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


const URL_GOOGLE_CONTACTS = 'https://people.googleapis.com/v1/people/me/connections'
const URL_GOOGLE_GROUPS = 'https://people.googleapis.com/v1/contactGroups'


async function contacts_sync_google(task:Task, oauth:OAuth):Promise<void>{
    // Sync contacts from a Google account
    let confirmed:Record<string, string>
    if (oauth.contacts_sync_token){
        confirmed = await contacts_sync_google_changes(task, oauth)
    }
    confirmed = await contacts_sync_google_full(task, oauth)
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
    const existing_contacts = await self._db.contacts.list_for_account('google', oauth.issuer_id)
    const existing_by_id = Object.fromEntries(existing_contacts.map(c => [c.service_id, c]))

    // Keep track of final confirmed contacts with mapping from service's id to Stello id
    const confirmed:Record<string, string> = {}

    // Download pages of contacts until none left
    const page_size = 100
    let page_token:string
    while (true){

        // Make request
        // NOTE Page size default is 100, and while could do 1000, less better for progress tracking
        // NOTE May raise MustReconnect or MustReauthenticate, which are handled by task manager
        const resp_data = await task.expected(oauth_request(oauth, URL_GOOGLE_CONTACTS, {
            requestSyncToken: 'true',
            personFields: 'names,emailAddresses',
            pageSize: `${page_size}`,
            pageToken: page_token || '',
        }))

        // Save the contacts
        for (const person of resp_data.connections){

            // Extract relevant data
            const service_id = partition(person.resourceName, '/')[1]  // Google appends 'people/'
            const name = google_primary(person.names)?.unstructuredName?.trim() || ''
            const email = google_primary(person.emailAddresses)?.value?.trim()

            // Ignore contacts without email addresses
            // NOTE If did previously have one that record will be removed in final step
            if (!email){
                continue
            }

            // Either update existing or add new contact
            if (service_id in existing_by_id){
                const existing = existing_by_id[service_id]
                if (existing.name !== name || existing.address !== email){
                    existing.name = name
                    existing.address = email
                    self._db.contacts.set(existing)
                }
                delete existing_by_id[service_id]  // Prevent deletion during final step
                confirmed[existing.service_id] = existing.id
            } else {
                const created = await self._db.contacts.create(
                    name, email, `google:${oauth.issuer_id}`, service_id)
                confirmed[created.service_id] = created.id
            }
        }

        // Check if last page / sync token
        if (resp_data.nextSyncToken){
            // A sync token was returned, so this is the last page
            oauth.contacts_sync_token = resp_data.nextSyncToken
            self._db.oauths.set(oauth)
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
        self._db.contacts.remove(existing.id)
    }

    // Return confirmed ids
    return confirmed
}


async function contacts_sync_google_groups(task:Task, oauth:OAuth, confirmed:Record<string, string>,
        ):Promise<void>{
    // Sync contact groups from a Google account

    // Get fresh list of the groups
    // NOTE While could use pagination/syncToken, list likely to be very small and not worth it
    const list_resp = await task.add(oauth_request(oauth, URL_GOOGLE_GROUPS, {
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
        if (batch_size >= 40 || (batch_size && total_members + group.memberCount > 1000)){
            total_members = 0
            batches.unshift([group])
        } else {
            batches[0].push(group)
        }
        total_members += group.memberCount
    }

    // Update subtasks count since know how many batches there'll be
    task.upcoming(batches.length)

    // Get existing groups from db
    const existing_groups = await self._db.groups.list_for_account(oauth.issuer, oauth.issuer_id)
    const existing_by_id = Object.fromEntries(existing_groups.map(g => [g.service_id, g]))

    // Make batch get requests, as members data isn't returned for list requests
    for (const batch of batches){
        const get_resp = await task.expected(oauth_request(oauth, `${URL_GOOGLE_GROUPS}:batchGet`, {
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
                self._db.groups.set(existing)
                delete existing_by_id[service_id]  // Prevent deletion during final step
            } else {
                self._db.groups.create(name, members, `google:${oauth.issuer_id}`, service_id)
            }
        }
    }

    // Remove any remaining existing groups since are no longer present in the service
    for (const existing of Object.values(existing_by_id)){
        self._db.groups.remove(existing.id)
    }
}


function google_primary(options:{metadata:{primary:boolean}}[]):Record<string, any>{
    // Helper for Google data structures that selects either the primary item, else the first one
    if (!options?.length){
        return  // Arg may be undefined or an empty array if that data wasn't returned by Google
    }
    for (const item of options){
        if (item.metadata.primary){
            return item
        }
    }
    return options[0]
}

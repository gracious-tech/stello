
import {Task} from "./tasks"
import {OAuth} from "../database/oauths"
import {oauth_request} from "../oauth"
import {partition} from "../utils/strings"


// Functions which sync contacts in ways specific to the issuer
const handlers:{[issuer:string]:((task:Task, oauth:OAuth)=>Promise<void>)[]} = {
    google: [sync_contacts_google, sync_groups_google],
}


export async function contacts_sync(task:Task):Promise<Promise<void>[]>{
    // Task for syncing contacts

    // Extract args from task object and get oauth record
    const [oauth_id] = task.params
    const oauth = await self._db.oauths.get(oauth_id)

    // Configure task object
    task.label = `Syncing contacts for ${oauth.display_issuer} account ${oauth.email}`
    task.show_count = true
    task.fix_oauth = oauth

    // Call array of handlers specific to the oauth's issuer
    return handlers[oauth.issuer].map(handler => handler(task, oauth))
}


// GOOGLE


const URL_GOOGLE_CONTACTS = 'https://people.googleapis.com/v1/people/me/connections'


async function sync_contacts_google(task:Task, oauth:OAuth):Promise<void>{
    // Sync contacts from a Google account
    if (oauth.contacts_sync_token){
        return sync_contacts_google_changes(task, oauth)
    }
    return sync_contacts_google_full(task, oauth)
}


async function sync_contacts_google_changes(task:Task, oauth:OAuth):Promise<void>{
    // Do a sync for the Google account that requests only what has changed rather than all data
    return sync_contacts_google_full(task, oauth)  // TODO
}


async function sync_contacts_google_full(task:Task, oauth:OAuth):Promise<void>{
    // Do a full sync for the Google account, comparing with own existing records

    // Increase subtasks for initial page (better predictions after that)
    task.upcoming(1)

    // Get list of previously synced contacts for account and map by service's ids
    const existing_contacts = await self._db.contacts.list_for_account('google', oauth.issuer_id)
    const existing_by_id = Object.fromEntries(existing_contacts.map(c => [c.service_id, c]))

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
            } else {
                self._db.contacts.create(name, email, `google:${oauth.issuer_id}`, service_id)
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
}


async function sync_groups_google(task:Task, oauth:OAuth):Promise<void>{
    // Sync contact groups from a Google account
    // TODO
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

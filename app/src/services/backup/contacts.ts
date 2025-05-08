
import papaparse from 'papaparse'

import {string_to_utf8} from '@/services/utils/coding'
import {sanitize_filename} from '@/services/utils/strings'
import {determine_backup_dir} from './generic'

import type {Contact} from '@/services/database/contacts'
import type {Unsubscribe} from '@/services/database/unsubscribes'
import type {Profile} from '@/services/database/profiles'


// Generate CSV data for given contacts
export function export_contacts_csv(contacts:Contact[], unsubs:Unsubscribe[], profiles:Profile[])
        :ArrayBuffer{

    // Form array of rows for basic contact data
    const data = [['Name', 'Email', 'Notes', 'Greet as', 'Is mailing list']]
    data.push(...contacts.map(c => {
        return [
            c.name,
            c.address,
            c.notes,
            c.name_hello,
            c.multiple ? 'True' : '',
        ] as string[]
    }))

    // Add columns for unsubscribes
    for (const profile of profiles){
        data[0]!.push(`Unsubscribed (${profile.display_host})`)
        for (let i = 0; i < contacts.length; i++){
            const uns = unsubs.find(u => u.contact === contacts[i]!.id && u.profile === profile.id)
            data[i+1]!.push(uns ? 'Unsubscribed' : '')
        }
    }

    // Return as ArrayBuffer
    return string_to_utf8(papaparse.unparse(data))
}


// See if due to backup contacts and auto-manage creation and deletion of old ones
export async function backup_contacts(){

    // Auto-determine whether to do backup and which old backup to delete when done
    const [backup_dir, stale_dir] = await determine_backup_dir('Contacts')
    if (!backup_dir){
        return
    }

    // Backup to chosen dir
    await save_contacts_to_dir(backup_dir)

    // If all went well, delete old backup if one designated
    if (stale_dir){
        await self.app_native.user_file_remove(stale_dir)
    }
}


// Save all contacts and groups to designated backup dir
export async function save_contacts_to_dir(backup_dir:string){

    // Get all contacts and groups (excluding from service accounts)
    const contacts = (await self.app_db.contacts.list()).filter(c => !c.service_account)
    const groups = (await self.app_db.groups.list()).filter(g => !g.service_account)
    const unsubs = await self.app_db.unsubscribes.list()
    const profiles = await self.app_db.profiles.list()

    // Abort if no contacts (as DB likely got wiped)
    if (!contacts.length){
        return
    }

    // Save individual file for each group
    for (const group of groups){
        const file_name = sanitize_filename(group.name) + '.csv'
        const file_path = backup_dir + '/' + file_name
        const groups_contacts = contacts.filter(c => group.contacts.includes(c.id))
        const csv = export_contacts_csv(groups_contacts, unsubs, profiles)
        await self.app_native.user_file_write(file_path, csv)
    }

    // Save all contacts to single file (last so overwrites group if same name)
    await self.app_native.user_file_write(backup_dir + '/All Contacts.csv',
        export_contacts_csv(contacts, unsubs, profiles))

}

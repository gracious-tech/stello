
import path from 'node:path'

import papaparse from 'papaparse'

import {string_to_utf8} from '@/services/utils/coding'

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


// Determine which dir to backup to and which to delete if backup successful
export async function determine_backup_dir(category:string):Promise<[string|null, string|null]>{

    // Get names of items in backups dir
    const backup_dir_items = await self.app_native.user_file_list(path.join('Backups', category))

    // Don't do anything if already backedup today
    const today_name = new Date().toISOString().slice(0, 'yyyy-mm-dd'.length)  // Will be UTC
    if (backup_dir_items.includes(today_name)){
        return [null, null]
    }

    // Get timestamp for each and filter out any invalid ones (that user might have put there)
    // NOTE "When the time zone offset is absent, date-only forms are interpreted as a UTC time"
    const backups = backup_dir_items
        .map(date_str => ([date_str, new Date(date_str).getTime()]))
        .filter(([date_str, timestamp]) => !Number.isNaN(timestamp)) as [string, number][]

    // Sort from oldest to newest
    backups.sort((a, b) => a[1] - b[1])

    // Don't delete any previous backups if less than 3
    if (backups.length < 3){
        return [today_name, null]
    }

    // Delete either oldest or youngest backup, ensuring always have a month old one
    // So if second oldest is over one month old then safe to delete oldest
    const days = (new Date().getTime() - backups[1]![1]) / (1000 * 60 * 60 * 24)
    const dir_to_remove = days > 30 ? backups[0]![0] : backups.at(-1)![0]
    return [
        path.join('Backups', category, today_name),
        path.join('Backups', category, dir_to_remove),
    ]
}


// See if due to backup contacts and auto-manage creation and deletion of old ones
export async function backup_contacts(){

    // Auto-determine whether to do backup and which old backup to delete when done
    const [backup_dir, stale_dir] = await determine_backup_dir('Contacts')
    if (!backup_dir){
        return
    }

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
    const promises:Promise<void>[] = []
    for (const group of groups){
        // SECURITY Escape special characters when creating file name
        const file_name = group.name.replace(/[/\\?%*:|"<>]/g, '-') + '.csv'
        const file_path = path.join(backup_dir, file_name)
        const groups_contacts = contacts.filter(c => group.contacts.includes(c.id))
        const csv = export_contacts_csv(groups_contacts, unsubs, profiles)
        promises.push(self.app_native.user_file_write(file_path, csv))
    }

    // Save all contacts to single file (last so overwrites group if same name)
    promises.push(self.app_native.user_file_write(path.join(backup_dir, 'All Contacts.csv'),
        export_contacts_csv(contacts, unsubs, profiles)))

    // If all went well, delete old backup if one designated
    await Promise.all(promises)
    if (stale_dir){
        await self.app_native.user_file_remove(stale_dir)
    }
}

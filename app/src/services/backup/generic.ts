
import {save_drafts_to_dir, save_messages_to_dir} from '@/services/backup/drafts'
import {save_replies_to_dir} from '@/services/backup/replies'


// Get backups dir with dbid included
// This prevents backups from being removed if db is wiped
export function get_backups_dir(){
    return `Backups [${self.app_store.state.dbid}]`
}


// Determine which dir to backup to and which to delete if backup successful
export async function determine_backup_dir(category:string):Promise<[string|null, string|null]>{

    // Get names of items in backups dir
    const backups_dir = get_backups_dir()
    const backup_dir_items = await self.app_native.user_file_list(`${backups_dir}/${category}`)

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
    const new_backup_path = `${backups_dir}/${category}/${today_name}`
    if (backups.length < 3){
        return [new_backup_path, null]
    }

    // Delete either oldest or youngest backup, ensuring always have a month old one
    // So if second oldest is over one month old then safe to delete oldest
    const days = (new Date().getTime() - backups[1]![1]) / (1000 * 60 * 60 * 24)
    const dir_to_remove = days > 30 ? backups[0]![0] : backups.at(-1)![0]
    return [new_backup_path, `${backups_dir}/${category}/${dir_to_remove}`]
}


// Save all types of messages into subdirs of given parent dir
export async function save_all_messages(parent_dir:string){
    await save_replies_to_dir(parent_dir + '/Responses')
    await save_drafts_to_dir(parent_dir + '/Drafts')
    await save_messages_to_dir(parent_dir + '/Sent Messages', parent_dir + '/Sent Replies')
}

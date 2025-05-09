
import {backup_contacts} from '@/services/backup/contacts'
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
export async function save_all_messages(parent_dir:string):Promise<string[]>{

    // Do each sequentially and don't stop if one task fails
    // Add *special title* if whole task fails, or otherwise report individual messages
    // This is a multi-layered approach to ensure whatever can be exported is exported
    const failed_titles:string[] = []

    try {
        await save_replies_to_dir(parent_dir + '/Responses')
    } catch (error){
        failed_titles.push("*Responses from recipients*")
        self.app_report_error(error)
    }

    try {
        failed_titles.push(...await save_drafts_to_dir(parent_dir + '/Drafts'))
    } catch (error){
        failed_titles.push("*Drafts*")
        self.app_report_error(error)
    }

    try {
        failed_titles.push(...await save_messages_to_dir(
            parent_dir + '/Sent Messages', parent_dir + '/Sent Replies'))
    } catch (error){
        failed_titles.push("*Sent Messages*")
        self.app_report_error(error)
    }

    return failed_titles
}


// Run all backups
export async function run_backups(setting:'none'|'contacts'|'all'){
    if (setting === 'none'){
        return
    }
    // Do one after another, but silently report errors and avoid preventing others from running
    try {
        await backup_contacts()
    } catch (error){
        self.app_report_error(error)  // Silent report
    }
    if (setting === 'all'){
        try {
            await save_all_messages(get_backups_dir())
        } catch (error){
            self.app_report_error(error)  // Silent report
        }
    }
}

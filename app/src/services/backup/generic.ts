
import {backup_contacts} from '@/services/backup/contacts'
import {export_database} from '@/services/backup/database'
import {save_drafts_to_dir, save_messages_to_dir} from '@/services/backup/drafts'
import {save_replies_to_dir} from '@/services/backup/replies'
import {get_backups_dir, find_other_backup_dbids, determine_backup_dir} from './backup_dirs'

// Re-export so existing callers don't need to change their import paths
export {get_backups_dir, find_other_backup_dbids, determine_backup_dir}


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


// Backup database to JSON, returning the exported buffer so can be reused if desired
export async function run_database_backup():Promise<ArrayBuffer>{
    const buffer = await export_database()
    await self.app_native.user_file_write(`${get_backups_dir()}/database.json`, buffer)
    return buffer
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

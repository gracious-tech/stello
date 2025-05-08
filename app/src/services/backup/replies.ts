
import papaparse from 'papaparse'

import {string_to_utf8} from '@/services/utils/coding'
import {sort} from '@/services/utils/arrays'


// Generate CSV data for replies
export async function export_replies_csv():Promise<ArrayBuffer>{

    // Get replies
    const replies = await self.app_db.replies.list()
    sort(replies, 'sent', false)

    // Form array of rows
    const data = [
        ["Name", "Contents", "Date", "Response to", "Type", "I replied to this", "Archived"]]
    data.push(...replies.map(r => {
        return [
            r.contact_name,
            r.content,
            r.sent.toLocaleString(),  // Spreadsheets don't reliably understand format/timezone
            r.msg_title,
            r.section_id ? "Comment on section" : "Reply to message",
            r.replied ? "yes" : "no",
            r.archived ? "yes" : "no",
        ] as string[]
    }))

    // Return as ArrayBuffer
    return string_to_utf8(papaparse.unparse(data))
}


// Save replies to given backup dir
export async function save_replies_to_dir(backup_dir:string){
    const csv_data = await export_replies_csv()
    await self.app_native.user_file_write(`${backup_dir}/Replies.csv`, csv_data)
}

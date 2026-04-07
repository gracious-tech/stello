
// Utilities for resolving backup directory paths and rotation logic
// Kept separate from generic.ts so they can be unit tested without pulling in build-only assets


// Get backups dir with dbid included
// This prevents backups from being removed if db is wiped
export function get_backups_dir():string{
    return `Backups [${self.app_store.state.dbid}]`
}


// Find dbids of backup dirs that differ from the given current dbid and contain a database.json
export async function find_other_backup_dbids(current_dbid:string):Promise<string[]>{
    const items = await self.app_native.user_file_list('')
    const other_dbids:string[] = []
    for (const item of items){
        const match = item.match(/^Backups \[(.+)\]$/)
        if (match && match[1] !== current_dbid){
            const contents = await self.app_native.user_file_list(item)
            if (contents.includes('database.json')){
                other_dbids.push(match[1]!)
            }
        }
    }
    return other_dbids
}


// Determine which dir to backup to and which to delete if backup successful
export async function determine_backup_dir(category:string):Promise<[string|null, string|null]>{

    // Get names of items in backups dir
    const backups_dir = get_backups_dir()
    const backup_dir_items = await self.app_native.user_file_list(`${backups_dir}/${category}`)

    // Don't do anything if already backed up today
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

    // Delete either oldest or youngest backup, ensuring always have a month-old one
    // So if second oldest is over one month old then safe to delete oldest
    const days = (new Date().getTime() - backups[1]![1]) / (1000 * 60 * 60 * 24)
    const dir_to_remove = days > 30 ? backups[0]![0] : backups.at(-1)![0]
    return [new_backup_path, `${backups_dir}/${category}/${dir_to_remove}`]
}

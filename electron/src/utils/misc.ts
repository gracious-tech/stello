
import check_disk_space from 'check-disk-space'

import {data_dir} from './paths'


// Get percent of free disk space for drive for data_dir (defaults to 100 if error)
export async function get_free_space():Promise<number>{
    try {
        const disk_space = await check_disk_space(data_dir)
        return Math.floor(disk_space.free / disk_space.size * 100)
    } catch {
        return 100
    }
}

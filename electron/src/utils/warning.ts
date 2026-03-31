
import {join} from 'node:path'
import {readFile, writeFile} from 'node:fs/promises'


const warn_text = `
Stello uses this folder to store your data.

# Moving the folder
CLOSE STELLO before copying/moving this folder.
If you are changing computer, copy this folder to the same place on your new computer.
If enabling portable mode (keeping your data on an external drive) move it next to the Stello app.

# Contents
Exported       - Contains data you've exported from Stello (use as you like)
Backups [...]  - Contains automated backups (use if needed)
Internal Files - Contains your images etc (don't touch it)
Internal Data  - Contains your data (don't touch it)

# Help
See the guide at https://stello.news/guide/backup/ for further instructions.
`


export const readme_filename = 'READ ME before moving this folder.txt'


export async function write_warning_file(files_dir:string):Promise<void>{
    // Ensure warning file exists
    const warn_file = join(files_dir, readme_filename)
    const existing = await readFile(warn_file, {encoding: 'utf8'}).catch(() => '')
    if (existing !== warn_text)
        void writeFile(warn_file, warn_text)
}


import {join} from 'path'
import {existsSync, renameSync, mkdirSync, writeFileSync} from 'original-fs'

import {app} from 'electron'

import {app_path} from '../utils/paths'


// Cease execution if another instance of Stello is already running
// NOTE The other instance will receive an event and focus itself instead
// WARN Needs to run before set paths so doesn't potenitally move data while app operating
if (!app.requestSingleInstanceLock()){
    app.exit()  // WARN Don't use quit() as is async
}


// Determine old data locations (v1.5.3 and below)
// WARN Do this before setting any paths
const old_portable_data = join(app_path, '..', 'stello_data')
const old_user_data = app.getPath('userData')


// Possible locations for files
const files_dir_documents = join(app.getPath('documents'), 'Stello Files')
const files_dir_portable = join(app_path, '..', 'Stello Files')


// Portable support (if files dir exists next to app then use it)
export const files_dir = existsSync(files_dir_portable) ? files_dir_portable : files_dir_documents


// Create dir and warning file if doesn't exist yet
const warn_file = join(files_dir, 'READ ME before moving this folder.txt')
const warn_text = `
Stello uses this folder to store all your data.
Close Stello before copying/moving this folder.
If you are changing computer, copy this folder to the same place on your new computer.
If enabling portable mode (keeping your data on an external drive) move it next to the Stello app.
See the guide at stello.news for further instructions.

Internal Data - Contains all your data, don't touch it
Backups - Contains automated backups you can use to recover lost contacts etc.
`
mkdirSync(files_dir, {recursive: true})  // Ensure files dir exists
if (!existsSync(warn_file)){
    writeFileSync(warn_file, warn_text)
}


// Set path for Electron's data
const electron_user_data = join(files_dir, 'Internal Data')
app.setPath('userData', electron_user_data)


// Move old data if exists and no new data present
if (!existsSync(electron_user_data)){
    if (existsSync(old_portable_data)){
        renameSync(old_portable_data, electron_user_data)
    } else if (existsSync(old_user_data)){
        renameSync(old_user_data, electron_user_data)
    }
}

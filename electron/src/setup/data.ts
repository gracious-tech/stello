
import {join} from 'path'
import {existsSync, renameSync, mkdirSync} from 'original-fs'

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
mkdirSync(files_dir, {recursive: true})  // Ensure exists


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

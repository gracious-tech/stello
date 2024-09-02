
import {join} from 'path'
import {existsSync, renameSync, mkdirSync, writeFileSync} from 'original-fs'

import {app} from 'electron'

import {files_dir, old_data_location} from '../utils/paths'


// Cease execution if another instance of Stello is already running
// NOTE The other instance will receive an event and focus itself instead
// WARN Needs to run before set paths so doesn't potenitally move data while app operating
if (!app.requestSingleInstanceLock()){
    app.exit()  // WARN Don't use quit() as is async
}


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


// Move old data if exists (location is only set if new data doesn't already exist)
if (old_data_location){
    renameSync(old_data_location, electron_user_data)
}

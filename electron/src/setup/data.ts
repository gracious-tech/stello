
import {join} from 'path'
import {existsSync, renameSync, mkdirSync, writeFileSync, cpSync} from 'original-fs'

import {app} from 'electron'

import {files_dir, old_data_location} from '../utils/paths'


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
mkdirSync(electron_user_data, {recursive: true})  // Create if doesn't exist yet
app.setPath('userData', electron_user_data)


// Move old data if exists (location is only set if new data doesn't already exist)
if (old_data_location){
    try {
        renameSync(old_data_location, electron_user_data)
    } catch {
        // Rename can sometimes fail on Windows if something else has opened a file
        // So continue to copy the rest of the files so rename is not left incomplete
        // WARN Only copy as a backup as some users will have GBs of data
        cpSync(old_data_location, electron_user_data, {recursive: true})
    }
}


// Cease execution if another instance of Stello is already running
// NOTE The other instance will receive an event and focus itself instead
// NOTE Works by creating a lockfile in data dir, so can't call before setting userData dir
// WARN Makes renameSync fail due to lockfile creation so must come after moving old data
if (!app.requestSingleInstanceLock()){
    app.exit()  // WARN Don't use quit() as is async
}

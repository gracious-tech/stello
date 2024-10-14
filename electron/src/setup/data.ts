
import {join} from 'path'
import {existsSync, mkdirSync, writeFileSync} from 'original-fs'

import {app} from 'electron'

import {files_dir, data_dir} from '../utils/paths'


// Ensure files dir exists
mkdirSync(files_dir, {recursive: true})


// Ensure warning file exists
const warn_text = `
Stello uses this folder to store your data.
Close Stello before copying/moving this folder.
If you are changing computer, copy this folder to the same place on your new computer.
If enabling portable mode (keeping your data on an external drive) move it next to the Stello app.

Internal Data - Contains your data, don't touch it
Backups - Contains automated backups you can use to recover lost contacts etc.

See the guide at stello.news for further instructions and old locations of data
(if the Internal Data folder doesn't exist).
`
const warn_file = join(files_dir, 'READ ME before moving this folder.txt')
if (!existsSync(warn_file)){
    writeFileSync(warn_file, warn_text)
}


// Set path for Electron's data
mkdirSync(data_dir, {recursive: true})
app.setPath('userData', data_dir)


// Cease execution if another instance of Stello is already running
// NOTE The other instance will receive an event and focus itself instead
// NOTE Works by creating a lockfile in data dir, so can't call before setting userData dir
// WARN Will prevent moving the data dir due to lockfile creation
if (!app.requestSingleInstanceLock()){
    app.exit()  // WARN Don't use quit() as is async
}

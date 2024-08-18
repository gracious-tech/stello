
import {join} from 'path'
import {existsSync} from 'original-fs'

import {app} from 'electron'

import {app_path} from '../utils/paths'


// Cease execution if another instance of Stello is already running
// NOTE The other instance will receive an event and focus itself instead
// WARN Needs to run before set paths so doesn't potenitally move data while app operating
if (!app.requestSingleInstanceLock()){
    app.exit()  // WARN Don't use quit() as is async
}


// Portable support (if data dir exists next to app then use it)
const portable_data = join(app_path, '..', 'stello_data')
if (existsSync(portable_data)){
    app.setPath('userData', portable_data)
}

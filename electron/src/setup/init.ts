// Setup that must be done before everything else

import {join} from 'path'
import {existsSync} from 'original-fs'

import {app} from 'electron'

import {app_path} from '../utils/paths'


// Portable support (if data dir exists next to app then use it)
const portable_data = join(app_path, '..', 'stello_data')
if (existsSync(portable_data)){
    app.setPath('userData', portable_data)
}


// Don't open if another instance of Stello is already running
// NOTE The other instance will receive an event and focus itself instead
if (!app.requestSingleInstanceLock()){
    app.quit()
    process.exit()  // Avoid executing any further (as `app.quit()` is async)
}


// SECURITY Enable sandboxing of renderers
app.enableSandbox()

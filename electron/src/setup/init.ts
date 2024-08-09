// Setup that must be done before everything else

import {join} from 'path'
import {existsSync} from 'original-fs'

import semver from 'semver'
import {app, dialog} from 'electron'

import store from '../utils/store'
import {app_path} from '../utils/paths'


// Portable support (if data dir exists next to app then use it)
const portable_data = join(app_path, '..', 'stello_data')
if (existsSync(portable_data)){
    app.setPath('userData', portable_data)
}


// Don't open if another instance of Stello is already running
// NOTE The other instance will receive an event and focus itself instead
if (!app.requestSingleInstanceLock()){
    app.exit()  // WARN Don't use quit() as is async
}


// Prevent loading data from a previous version as Chrome will purge the whole db!
if (semver.gt(store.state.version, app.getVersion())){
    // NOTE This is one of the only Electron APIs that DOES work before ready event
    dialog.showErrorBox(
        "Download the latest version of Stello",
        `You're trying to use version ${app.getVersion()} when you previously used version ${store.state.version}.`,
    )
    app.exit()  // WARN Don't use quit() as is async
} else if (store.state.version !== app.getVersion()){
    // Version has increased
    store.state.version = app.getVersion()
    store.save()
}


// SECURITY Enable sandboxing of renderers
app.enableSandbox()


// Disable caching as all assets are local and it wastes disk space (up to 100MB)
app.commandLine.appendSwitch('disable-http-cache')

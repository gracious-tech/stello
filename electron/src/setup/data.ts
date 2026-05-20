
import {mkdirSync} from 'original-fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'

import {app, dialog} from 'electron'

import {files_dir, data_dir, files_dir_missing} from '../utils/paths.js'
import {write_immobile_config, immobile_config_dir} from '../utils/immobile_config.js'
import {write_warning_file} from '../utils/warning.js'


function show_fail_dialog(inaccessible_path:string){
    const body = `Stello can't access ${inaccessible_path}\n`
        + "Visit stello.news/guide/ for help resolving this,"
        + " or contact us (gracious.tech/contact)"
    dialog.showErrorBox("Stello can't access its files", body)
    app.exit()  // App may not even be able to open anyway as SingleInstanceLock writes lock file
}


// If files dir is missing, prevent creating Stello Files as will relaunch
if (files_dir_missing){
    // Set tmp dir for userData to avoid creating empty Stello Files and confusing user
    app.setPath('userData', join(tmpdir(), 'stello_removeable'))
} else {

    // Ensure files dir exists and write warning file
    try {
        mkdirSync(files_dir, {recursive: true})
        // WARN This also serves as a "have write permission" test
        //      This is important for Macs which would otherwise fail silently if no Documents perm
        write_warning_file(files_dir)
    } catch {
        show_fail_dialog(files_dir)
    }

    // Remember current files dir so can detect if it goes missing later
    try {
        write_immobile_config(files_dir)
    } catch {
        show_fail_dialog(immobile_config_dir)
    }

    // Set path for Electron's data
    try {
        mkdirSync(data_dir, {recursive: true})
        app.setPath('userData', data_dir)
    } catch {
        show_fail_dialog(data_dir)
    }
}


// Cease execution if another instance of Stello is already running
// NOTE The other instance will receive an event and focus itself instead
// NOTE Works by creating a lockfile in data dir, so can't call before setting userData dir
// WARN Will prevent moving the data dir due to lockfile creation
if (!app.requestSingleInstanceLock()){
    app.exit()  // WARN Don't use quit() as is async
}

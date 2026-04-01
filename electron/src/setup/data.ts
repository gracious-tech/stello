
import {mkdirSync} from 'original-fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'

import {app} from 'electron'

import {files_dir, data_dir, files_dir_missing} from '../utils/paths.js'
import {write_immobile_config} from '../utils/immobile_config.js'
import {write_warning_file} from '../utils/warning.js'


// If files dir is missing, prevent creating Stello Files as will relaunch
if (files_dir_missing){
    // Set tmp dir for userData to avoid creating empty Stello Files and confusing user
    app.setPath('userData', join(tmpdir(), 'stello_removeable'))
} else {
    // Ensure files dir exists
    mkdirSync(files_dir, {recursive: true})

    // Save warning file (if needed)
    void write_warning_file(files_dir)

    // Remember current files dir so can detect if it goes missing later
    write_immobile_config(files_dir)

    // Set path for Electron's data
    mkdirSync(data_dir, {recursive: true})
    app.setPath('userData', data_dir)
}


// Cease execution if another instance of Stello is already running
// NOTE The other instance will receive an event and focus itself instead
// NOTE Works by creating a lockfile in data dir, so can't call before setting userData dir
// WARN Will prevent moving the data dir due to lockfile creation
if (!app.requestSingleInstanceLock()){
    app.exit()  // WARN Don't use quit() as is async
}

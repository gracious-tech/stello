
import {join, resolve, sep} from 'path'
import {existsSync} from 'original-fs'

import {app} from 'electron'


// Determine where app is, whether a single file (appimage) or a dir
/* getAppPath() results differ by env:
    dev: stello_app/electron
    Linux: tmp location (use APPIMAGE env var)
    Mac: Stello.app/Contents/Resources/app.asar
    Windows: StelloByGraciousTech/app/resources/app.asar
*/
// NOTE If an AppImage, need to set to the AppImage file rather than currently unpackaged code
let app_path = join(app.getAppPath(), '..')
if (app.isPackaged){
    app_path = process.env['APPIMAGE'] || join(app.getAppPath(), '..', '..', '..')
}


// Determine old data locations (v1.5.3 and below)
// WARN Do this before changing value of Electron's `userData` path
const old_portable_data = join(app_path, '..', 'stello_data')
const old_portable_data_exists = existsSync(old_portable_data)
const old_user_data = app.getPath('userData')
const old_user_data_exists = existsSync(old_user_data)


// Possible locations for files
const files_dir_documents = join(app.getPath('documents'), 'Stello Files')
const files_dir_portable = join(app_path, '..', 'Stello Files')


// Portable mode enabled if portable files dir exists (either old or new location)
const portable = old_portable_data_exists || existsSync(files_dir_portable)


// Can now determine active files dir location
const files_dir = portable ? files_dir_portable : files_dir_documents


// If the dir doesn't exist yet then see if any old data needs migrating
let old_data_location:string|null = null
if (!existsSync(files_dir)){
    if (old_portable_data_exists){
        old_data_location = old_portable_data
    } else if (old_user_data_exists){
        old_data_location = old_user_data
    }
}


export function restrict_path(root_dir:string, relative_path:string){
    // Restrict a relative path to the given root dir (returning absolute path)
    const full_path = resolve(root_dir, relative_path)
    if (!full_path.startsWith(root_dir + sep)){
        throw new Error(`Cannot access path outside of: ${root_dir}`)
    }
    return full_path
}


export {app_path, files_dir, old_data_location}


import {join, resolve, sep} from 'path'
import {existsSync, readFileSync} from 'original-fs'

import {app} from 'electron'

import {read_immobile_config} from './immobile_config.js'


// Detect if a deb/rpm package (AppImage not considered a package in this case)
const package_type_path = join(app.getAppPath(), '..', 'package-type')
const linux_package_type = existsSync(package_type_path) ?
    readFileSync(package_type_path, {encoding: 'utf8'}).trim() : null


// Determine where app is, whether a single file (e.g. appimage) or a dir
/* getAppPath() results differ by env:
    dev: stello_app/electron
    Linux (appimage): tmp location (use APPIMAGE env var)
    Linux (deb): Stello/resources/app.asar
    Linux (rpm): ? (probably same as deb)
    Mac: Stello.app/Contents/Resources/app.asar
    Windows (appx): StelloByGraciousTech/app/resources/app.asar
    Windows (exe): tmp location
*/
// NOTE If executing from a tmp location, need to set to the packaged file
let app_path = join(app.getAppPath(), '..')
if (app.isPackaged){
    if (linux_package_type){
        app_path = join(app.getAppPath(), '..', '..')
    } else {
        app_path = process.env['APPIMAGE']
            || process.env['PORTABLE_EXECUTABLE_FILE']
            || join(app.getAppPath(), '..', '..', '..')
    }
}


// Get user's documents dir
let docs_dir:string
try {
    docs_dir = app.getPath('documents')  // Not available in some Win/Mac setups for some reason
} catch {
    // Fallback on appData which is the parent of userData, since it must exist
    // In such cases there will be .../appData/stello & .../appData/Stello Files next to each other
    docs_dir = app.getPath('appData')
}


// Determine the possible locations for Stello Files
const stello_files_default = join(docs_dir, 'Stello Files')
const stello_files_portable = join(app_path, '..', 'Stello Files')
const stello_files_remembered = read_immobile_config()  // NOTE May be same as one above


// Determine the possible locations for internal data
const internal_data_default = join(stello_files_default, 'Internal Data')
const internal_data_portable = join(stello_files_portable, 'Internal Data')
const internal_data_remembered =
    stello_files_remembered && join(stello_files_remembered, 'Internal Data')
const internal_data_old = app.getPath('userData')
const internal_data_portable_old = join(app_path, '..', 'stello_data')


// Discover any existing internal data
// It may be in `Stello Files` for new users or old locations for long-term users
// Check for existance of IndexedDB dir as chance Electron may create empty dir before check
// (there was an issue with this on Windows at least, but couldn't confirm why, possibly lockfile)
const found_data_dir = [
    internal_data_portable,  // Highest priority
    ...(internal_data_remembered ? [internal_data_remembered] : []),
    internal_data_default,
    internal_data_portable_old,
    internal_data_old,  // Lowest priority
].find(l => existsSync(join(l, 'IndexedDB')))
const data_dir = found_data_dir ?? internal_data_default


// Portable mode is only triggered if a portable data dir already exists
const is_portable = [internal_data_portable, internal_data_portable_old].includes(data_dir)


// Determine files dir location based on same priorities above for internal data dir
// This should result is Stello Files containing internal data dir, unless it's at old location
const files_dir = is_portable
    ? stello_files_portable
    : (stello_files_remembered ?? stello_files_default)


// Consider the files dir as missing if there's no existing dir detected and it was remembered
// NOTE This still allows moving Stello Files to portable mode without triggering this
const files_dir_missing = !existsSync(files_dir) && stello_files_remembered !== null


function restrict_path(root_dir:string, relative_path:string){
    // Restrict a relative path to the given root dir (returning absolute path)
    // NOTE This should also normalize path separators for the right platform
    const full_path = resolve(root_dir, relative_path)
    // If not the root_dir itself and not a child, then fail
    if (full_path !== root_dir && !full_path.startsWith(root_dir + sep)){
        throw new Error(`Cannot access path outside of: ${root_dir}`)
    }
    return full_path
}


export {app_path, files_dir, data_dir, linux_package_type, files_dir_missing, is_portable,
    restrict_path}

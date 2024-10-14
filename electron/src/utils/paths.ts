
import {join, resolve, sep} from 'path'
import {existsSync} from 'original-fs'

import {app} from 'electron'


// Determine where app is, whether a single file (e.g. appimage) or a dir
/* getAppPath() results differ by env:
    dev: stello_app/electron
    Linux: tmp location (use APPIMAGE env var)
    Mac: Stello.app/Contents/Resources/app.asar
    Windows (appx): StelloByGraciousTech/app/resources/app.asar
    Windows (exe): tmp location
*/
// NOTE If executing from a tmp location, need to set to the packaged file
let app_path = join(app.getAppPath(), '..')
if (app.isPackaged){
    app_path = process.env['APPIMAGE']
        || process.env['PORTABLE_EXECUTABLE_FILE']
        || join(app.getAppPath(), '..', '..', '..')
}


// `Stello Files` dir always used for backups (even if internal data stored in old location)
// Version 1.6+
const possible_files_locations = [
    join(app_path, '..', 'Stello Files'),  // Portable mode
    join(app.getPath('documents'), 'Stello Files'),  // Normal mode
]
const files_dir = possible_files_locations.find(l => existsSync(l))
    || possible_files_locations[1]!  // Use normal dir for new users (not portable)


// Internal data may be in `Stello Files` for new users or old locations for long-term users
// NOTE Also within `Stello Files` for Mac/Linux users who received 1.6.6 update before 1.6.7
const possible_data_locations = [
    ...possible_files_locations.map(loc => join(loc, 'Internal Data')),  // Stello Files options
    join(app_path, '..', 'stello_data'),  // Old portable location
    app.getPath('userData'),  // Old normal location
]
// NOTE Check for existance of IndexedDB dir as chance Electron may create empty dir before check
// (there was an issue with this on Windows at least, but couldn't confirm why, possibly lockfile)
const data_dir = possible_data_locations.find(l => existsSync(join(l, 'IndexedDB')))
    || possible_data_locations[1]!  // Use normal dir for new users (not portable)


export function restrict_path(root_dir:string, relative_path:string){
    // Restrict a relative path to the given root dir (returning absolute path)
    // NOTE This should also normalize path separators for the right platform
    const full_path = resolve(root_dir, relative_path)
    if (!full_path.startsWith(root_dir + sep)){
        throw new Error(`Cannot access path outside of: ${root_dir}`)
    }
    return full_path
}


export {app_path, files_dir, data_dir}

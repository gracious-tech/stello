
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


// Get user's documents dir
let docs_dir:string
try {
    docs_dir = app.getPath('documents')  // Not available in some Win/Mac setups for some reason
} catch {
    // Fallback on appData which is the parent of userData, since it must exist
    // In such cases there will be .../appData/stello & .../appData/Stello Files next to each other
    docs_dir = app.getPath('appData')
}


// Internal data may be in `Stello Files` for new users or old locations for long-term users
// NOTE Also within `Stello Files` for Mac/Linux users who received 1.6.6 update before 1.6.7
const possible_data_locations = [
    join(app_path, '..', 'Stello Files', 'Internal Data'),  // Portable mode
    join(docs_dir, 'Stello Files', 'Internal Data'),  // Normal mode
    join(app_path, '..', 'stello_data'),  // Old portable location
    app.getPath('userData'),  // Old normal location
]
// NOTE Check for existance of IndexedDB dir as chance Electron may create empty dir before check
// (there was an issue with this on Windows at least, but couldn't confirm why, possibly lockfile)
const data_dir = possible_data_locations.find(l => existsSync(join(l, 'IndexedDB')))
    || possible_data_locations[1]!  // Use normal dir for new users (not portable)


// Files dir will always be a new `Stello Files` location even if data_dir is an old location
// This will allow Stello to gradually move data over to new location for long-term users
// It will either be the documents or portable location depending on whether data_dir is portable
const files_dir = [0, 2].includes(possible_data_locations.indexOf(data_dir))
    ? join(app_path, '..', 'Stello Files')
    : join(docs_dir, 'Stello Files')


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

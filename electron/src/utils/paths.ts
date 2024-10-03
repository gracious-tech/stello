
import {join} from 'path'

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

export {app_path}


import {join} from 'path'

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

export {app_path}

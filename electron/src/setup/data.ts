
import {join} from 'path'
import {existsSync} from 'original-fs'

import {app} from 'electron'

import {app_path} from '../utils/paths'


// Portable support (if data dir exists next to app then use it)
const portable_data = join(app_path, '..', 'stello_data')
if (existsSync(portable_data)){
    app.setPath('userData', portable_data)
}

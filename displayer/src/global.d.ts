
import {App} from 'vue'

import {database} from './services/database'
import {store} from './services/store'


declare global {

    type MinOne<T> = [T, ...T[]]

    interface String {
        replaceAll(from:string|RegExp, to:string|Function):string
    }

    interface ImportMeta {
        // Extend with vite's env vars that are always exposed
        env:{
            MODE:string,
            BASE_URL:string,
            PROD:boolean,
            DEV:boolean,
            VITE_ROLLBAR_DISPLAYER:string,
        }
    }

    interface Window {
        _hash:string
        _failed:boolean
        _browser_supported:boolean
        _fail_splash_unsupported():void
        _fail_report_critical:boolean
        _fail_report(msg:string|Error):void
        _fail_visual(network?:boolean):void
        _app:App
        _db:typeof database
        _store:typeof store
    }
}

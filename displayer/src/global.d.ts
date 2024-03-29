
import {App} from 'vue'

import {database} from './services/database'
import {store} from './services/store'


declare global {

    type MinOne<T> = [T, ...T[]]

    interface String {
        replaceAll(from:string|RegExp, to:string):string
    }

    interface ImportMeta {
        // Extend with vite's env vars that are always exposed
        env:{
            MODE:string,
            BASE_URL:string,
            PROD:boolean,
            DEV:boolean,
            VITE_ROLLBAR_DISPLAYER:string,
            VITE_HOSTED_MSGS_URL:string,
            VITE_LOCAL_RESPONDER?:boolean
        }
    }

    class CompressionStream {
        constructor(format:'gzip')
        readable:ReadableStream
        writable:WritableStream
    }

    interface Window {
        app_hash:string
        app_failed:boolean
        app_browser_supported:boolean
        app_splash_unsupported():void
        app_report_error_critical:boolean
        app_report_error(error:unknown):void
        app_fail_visual(network?:boolean):void
        app_vue:App
        app_db:typeof database
        app_store:typeof store
        CompressionStream:typeof CompressionStream
    }
}

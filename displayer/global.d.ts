
import {App} from 'vue'


declare global {

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
        }
    }

    interface Window {
        _hash:string
        _failed:boolean
        _browser_supported:boolean
        _fail_splash_unsupported():void
        _fail_report_last:number
        _fail_report_fatal:boolean
        _fail_report(msg:string):void
        _fail_visual(network?:boolean):void
        _app:App
    }
}

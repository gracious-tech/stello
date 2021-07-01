
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
        _browser_supported:boolean
        _fail_report(msg:string, crash?:boolean):void
        _fail_report_last:number
        _fail_splash(heading:string, msg:string):void
        _fail_splash_network():void
        _hash:string
        _app:App
    }
}

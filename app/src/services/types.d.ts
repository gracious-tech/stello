// Help Typescript understand special bundler-generated modules and also custom properties
// NOTE This should be crawled by Typescript automatically


declare module '*.vue' {
    import Vue from 'vue'
    export default Vue
}


declare module '*?raw' {
    // This "module" is actually just a string, so `content` is never actually accessible
    const content: string
    export default content
}


declare module '*?raw-svg' {
    // This "module" is actually just a string, so `content` is never actually accessible
    const content: string
    export default content
}


declare module 'Custom' {
    // Must wrap in a custom module so can import modules (for some reason)
    import Vue from 'vue'
    import {Store} from 'vuex'
    import {Database} from '@/services/database/database'
    import {AppStoreState} from '@/services/store/types'
    import {NativeInterface} from '@/services/native/types'

    // Apply globally (not just this virtual module)
    global {

        type MinOne<T> = [T, ...T[]]
        type OneOrTwo<T> = [T]|[T, T]

        interface Window {
            // Custom
            _app:Vue
            _store:Store<AppStoreState>
            _db:Database
            _toggle_dark():void
            _update():void
            app_report_error(error:unknown):string
            app_native:NativeInterface
        }

        interface ImportMeta {
            // Extend with vite's env vars
            env:{
                MODE:string,
                BASE_URL:string,
                PROD:boolean,
                DEV:boolean,
                VITE_DEV_HOST_SETTINGS:string,
                VITE_OAUTH_SECRET_GOOGLE:string,
                VITE_ROLLBAR_APP:string,
                VITE_ROLLBAR_RESPONDER:string,
            }
        }
    }
}

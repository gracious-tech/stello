// Help Typescript understand special webpack-generated modules and also custom properties
// NOTE This should be crawled by Typescript automatically


declare module '*.vue' {
    import Vue from 'vue'
    export default Vue
}


declare module '*.svg' {
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

    // Apply globally (not just this virtual module)
    global {

        interface Window {
            // Custom
            _app:Vue
            _store:Store<AppStoreState>
            _db:Database
            _editor:any  // No types available
            _fail(msg:string):void
            _fail_alert(msg:string):void
            _error_to_msg(error:Error):string
            _toggle_dark():void
        }

        interface Clipboard {
            // Missing
            read():Promise<Array<any>>
        }

        interface Selection {
            // Missing
            modify
        }
    }
}

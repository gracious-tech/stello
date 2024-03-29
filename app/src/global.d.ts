// Help Typescript understand special bundler-generated modules and also custom properties
// NOTE This should be crawled by Typescript automatically


// Import vite-specific stuff like ?raw ?url etc imports
// TODO triggers type issues (like app_db being any) -- import 'vite/client.d'


declare module '*.vue' {
    import Vue from 'vue'
    export default Vue
}


declare module '*?worker' {
    const workerConstructor:{
        new ():Worker
    }
    export default workerConstructor
}


declare module '*?url' {
    const src:string
    export default src
}


declare module '*?raw-svg' {
    // This "module" is actually just a string, so `content` is never actually accessible
    const content: string
    export default content
}


// Third-party modules that are missing types


declare module 'postal-mime' {

    interface Contact {
        name:string
        address:string
    }

    export default class PostalMime {
        parse(text:string):Promise<{to?:Contact[], cc?:Contact[], bcc:Contact[]}>
    }
}


declare module 'dnm-croppr' {
    // WARN May be outdated and different to fork of croppr

    export interface CropprOptions {
        aspectRatio?: number|undefined
        maxAspectRatio?: number|undefined
        maxSize?: SizeValue
        minSize?: SizeValue
        startSize?: SizeValue|undefined
        startPosition?: SizeValue|undefined
        onCropStart?(data: CropValue): void
        onCropMove?(data: CropValue): void
        onCropEnd?(data: CropValue): void
        onInitialize?(instance: Croppr): void
        returnMode?: 'real'|'ratio'|'raw'
    }

    export interface CropValue {
        x: number
        y: number
        width: number
        height: number
    }

    export interface SizeValue extends Array<string|number> {
        0: number,
        1: number,
        2?:'real'|'ratio'|'raw'
    }

    export default class Croppr {
        constructor(element: string|HTMLElement, options?: CropprOptions, deferred?: boolean)
        getValue(mode?: 'real'|'ratio'|'raw'): CropValue
        setImage(src: string): Croppr
        destroy(): void
        moveTo(x: number, y: number): Croppr
        resizeTo(width: number, height: number, origin?: Array<number>): Croppr
        scaleBy(factor: number, origin?: Array<number>): Croppr
        reset(): Croppr
    }
}


// Globally available


declare module 'Custom' {
    // Must wrap in a custom module so can import modules (for some reason)
    import Vue from 'vue'
    import {Store} from 'vuex'
    import {Database} from '@/services/database/database'
    import {AppStoreState} from '@/services/store/types'
    import {NativeInterface} from '@/services/native/types'

    class CompressionStream {
        constructor(format:'gzip')
        readable:ReadableStream
        writable:WritableStream
    }

    // Apply globally (not just this virtual module)
    global {

        type MinOne<T> = [T, ...T[]]
        type OneOrTwo<T> = [T]|[T, T]

        interface Window {
            // Custom
            app_vue:Vue
            app_store:Store<AppStoreState>
            app_db:Database
            app_toggle_dark():void
            app_update():void
            app_report_error(error:unknown):string
            app_native:NativeInterface
            CompressionStream:typeof CompressionStream,
        }

        interface ImportMeta {
            // Extend with vite's env vars
            env:{
                MODE:string,
                BASE_URL:string,
                PROD:boolean,
                DEV:boolean,
                VITE_DEV_HOST_SETTINGS:string,
                VITE_OAUTH_ID_GOOGLE:string,
                VITE_OAUTH_ID_MICROSOFT:string,
                VITE_OAUTH_SECRET_GOOGLE:string,
                VITE_ROLLBAR_APP:string,
                VITE_ROLLBAR_RESPONDER:string,
                VITE_HOSTED_REGION:string,
                VITE_HOSTED_USER_POOL:string,
                VITE_HOSTED_USER_POOL_CLIENT:string,
                VITE_HOSTED_IDENTITY_POOL:string,
                VITE_HOSTED_BUCKET:string,
                VITE_HOSTED_API:string,
                VITE_HOSTED_DOMAIN_BRANDED:string,
                VITE_HOSTED_DOMAIN_UNBRANDED:string,
            }
        }
    }
}


// Include polyfills
import 'core-js/features/string/replace-all'

import {createApp} from 'vue'

import {store} from './services/store'
import {database} from './services/database'
import {error_to_string} from './services/utils/exceptions'
// @ts-ignore For some reason TS imports below fine but says it can't when checking types
import App from './App.vue'


// Embed stello styles in JS (so doesn't block first render)
import './styles.sass'


// Dynamically add icon so that it's packaged in JS and don't have to upload as separate file
// @ts-ignore special image import
import icon_url from './assets/icon.png'
self.document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.href = icon_url


// Init Vue app so can configure before mounting
self._app = createApp(App)


// Handle Vue errors
self._app.config.errorHandler = (error, vm, info) => {
    // Vue will by default just log component errors, where as hard fail during dev is preferred
    // NOTE Vue's info arg says what part of Vue the error occured in (e.g. render/hook/etc)
    const details = `${error_to_string(error)}\n\n(Error in Vue ${info})`

    // Log and report
    console.error(details)  // tslint:disable-line:no-console
    self._fail_report(details)

    // Hard fail if in dev mode
    if (import.meta.env.MODE !== 'production'){
        self._fail_splash("Vue Error (dev only)", details)
    }
}
self._app.config.warnHandler = (msg, vm, trace) => {
    // Vue will by default just log warnings, where as hard fail during dev is preferred
    const details = `${msg}\n(Vue warning)\n\n${trace}`

    // Ignore if a Vue 2 compatibility thing
    if (details.includes('<Shared') && details.includes('Property "$listeners" was accessed')){
        return
    }

    // Log and report
    console.error(details)  // tslint:disable-line:no-console
    self._fail_report(details)

    // Hard fail if in dev mode
    if (import.meta.env.MODE !== 'production'){
        self._fail_splash("Vue Warning (dev only)", details)
    }
}


// Do init within an async function so can use await
async function init(){

    // Wait for dependencies to be ready
    await database.connect()
    await store.init()

    // Mount the app
    self._app.mount('#app')
}
init()

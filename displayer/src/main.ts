
// Include polyfills
import 'core-js/features/string/replace-all'

import {createApp} from 'vue'

import {store} from './services/store'
import {database} from './services/database'
import {error_to_string} from './services/utils/exceptions'
// @ts-ignore For some reason TS imports below fine but says it can't when checking types
import App from './App.vue'
import AppProgress from './components/AppProgress.vue'


// Embed stello styles in JS (so doesn't block first render)
import './styles.sass'


// Init Vue app so can configure before mounting
self._app = createApp(App)


// Handle Vue errors
self._app.config.errorHandler = (error, vm, info) => {
    // Vue will by default just log component errors, but many can actually be critical to UI
    // NOTE Vue's info arg says what part of Vue the error occured in (e.g. render/hook/etc)
    const details = `${error_to_string(error)}\n\n(Error in Vue ${info})`

    // Log and report
    console.error(details)  // tslint:disable-line:no-console
    self._fail_report(details)
    self._fail_visual()
}
self._app.config.warnHandler = (msg, vm, trace) => {
    // Vue will by default just log warnings, where as visible fail during dev is preferred
    const details = `${msg}\n(Vue warning)\n\n${trace}`

    // Ignore if a Vue 2 compatibility thing
    const compat_related = [
        '`beforeDestroy` has been renamed to `beforeUnmount`',
        'Property "$listeners" was accessed',
    ]
    if (details.includes('<Shared') && compat_related.some(s => details.includes(s))){
        return
    }

    // Log and report
    console.error(details)  // tslint:disable-line:no-console
    self._fail_report(details)

    // Visible fail only in dev mode, as just warnings, not errors
    if (import.meta.env.MODE !== 'production'){
        self._fail_visual()
    }
}


// Register global components
self._app.component('AppProgress', AppProgress)


// Do init within an async function so can use await
async function init(){

    // Wait for dependencies to be ready
    // NOTE Exposed globally so can debug
    await database.connect()
    self._db = database
    await store.init()
    self._store = store

    // Mount the app
    self._app.mount('#app')
}
init()

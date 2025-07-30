
// Include error handling before all else
import './init_errors'

// Include polyfills
import 'core-js/features/string/replace-all'

import {createApp} from 'vue'
import {createI18n} from 'petite-vue-i18n'

import {store} from '../services/store'
import {database} from '../services/database'
import {error_to_string} from '../services/utils/exceptions'
import App from '../components/App.vue'
import AppBtn from '../components/AppBtn.vue'
import AppProgress from '../components/AppProgress.vue'


// Embed stello styles in JS (so doesn't block first render)
import './init_styles.sass'


// Init Vue app so can configure before mounting
self.app_vue = createApp(App)


// Handle Vue errors
self.app_vue.config.errorHandler = (error, vm, info) => {
    // Vue will by default just log component errors, but many can actually be critical to UI
    // NOTE Vue's info arg says what part of Vue the error occured in (e.g. render/hook/etc)
    const details = `${error_to_string(error)}\n\n(Error in Vue ${info})`

    // Log and report
    console.error(details)  // tslint:disable-line:no-console
    self.app_report_error(details)
    self.app_fail_visual()
}
self.app_vue.config.warnHandler = (msg, vm, trace) => {
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
    self.app_report_error(details)

    // Visible fail only in dev mode, as just warnings, not errors
    if (import.meta.env.MODE !== 'production'){
        self.app_fail_visual()
    }
}


// Register i18n
const supported_locales = ['vi']  // TODO
const lower_lang = navigator.language.toLowerCase()
let browser_locale = lower_lang.split('-')[0] ?? 'en'
if (browser_locale === 'zh' && ['hant', 'tw', 'hk', 'mo'].includes(lower_lang.split('-')[1] ?? '')){
    browser_locale = 'zh-hant'  // Such countries primarily use traditional script
}
const i18n = createI18n({
    locale: browser_locale,
})
self.app_vue.use(i18n)
if (supported_locales.includes(browser_locale)){
    void import(`../locales/${browser_locale}.yaml`).then(messages => {
        i18n.global.setLocaleMessage(browser_locale, messages.default)
    })
}


// Register global components
self.app_vue.component('AppBtn', AppBtn)
self.app_vue.component('AppProgress', AppProgress)


// Do init within an async function so can use await
async function init(){

    // Wait for dependencies to be ready
    // NOTE Exposed globally so can debug
    await database.connect()
    self.app_db = database
    await store.init()
    self.app_store = store

    // Mount the app
    self.app_vue.mount('#app')
}
void init()

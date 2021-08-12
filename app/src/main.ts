
// Third-party
import Vue from 'vue'
import Vuex from 'vuex'
import VueRouter from 'vue-router'
import VueI18n from 'vue-i18n'
import Vuetify from 'vuetify/lib'  // WARN Must import from /lib for tree shaking
import VuetifyRoutable from 'vuetify/lib/mixins/routable'
import Rollbar from 'rollbar'

// Own modules
import '@/services/register_hooks'  // WARN Must come before any components imported
import app_config from '@/app_config.json'
import {Database, open_db} from '@/services/database/database'
import {get_store} from '@/services/store/store'
import {get_router} from '@/services/router'
import {on_update_ready, update} from '@/services/native/native'
import {task_manager, TaskManager} from '@/services/tasks/tasks'

// Components
import App from '@/components/App.vue'
import AppBtn from '@/components/global/AppBtn.vue'
import AppBtnCheckbox from '@/components/global/AppBtnCheckbox.vue'
import AppSVG from '@/components/global/AppSVG.vue'
import AppText from '@/components/global/AppText.vue'
import AppHtml from '@/components/global/AppHtml.vue'
import AppTextarea from '@/components/global/AppTextarea.vue'
import AppFile from '@/components/global/AppFile.vue'
import AppSwitch from '@/components/global/AppSwitch.vue'
import AppSelect from '@/components/global/AppSelect.vue'
import AppContent from '@/components/global/AppContent.vue'
import AppContentList from '@/components/global/AppContentList.vue'
import AppInteger from '@/components/global/AppInteger.vue'
import AppPassword from '@/components/global/AppPassword.vue'
import AppMenuMore from '@/components/global/AppMenuMore.vue'
import AppListItem from '@/components/global/AppListItem.vue'
import AppSecurityIcon from '@/components/global/AppSecurityIcon.vue'
import AppSecurityAlert from '@/components/global/AppSecurityAlert.vue'


// Trigger addition of styles
import '@/styles/generic.sass'
import '@/shared/shared_styles.sass'
import '@/styles/fonts.css'
import 'croppr/dist/croppr.css'


// Declare custom props on Vue instances
declare module "vue/types/vue" {
    interface Vue {
        $rollbar:Rollbar
        $network_error:(error:any)=>void
        $tm:TaskManager
    }
}


// Show update bar if one available
self._update = () => {
    update()
}
on_update_ready(() => {
    // Remove any existing reload bar, as update restarts electron and would solve errors anyway
    self.document.querySelector('.reload-bar')?.remove()
    // Insert the bar
    self.document.body.insertAdjacentHTML('afterbegin', `
        <div class="reload-bar update">
            An update is ready to go with improvements
            <div>
                <button onclick="_update()">
                    RESTART
                </button>
            </div>
        </div>
    `)
})


// Visual failure util
function show_fail_bar(){
    // Display fail bar with button to reload app

    // Don't show if a fail bar or update bar already exists
    if (self.document.querySelector('.reload-bar') !== null){
        return
    }

    // Insert the bar
    self.document.body.insertAdjacentHTML('afterbegin', `
        <div class="reload-bar fail">
            A problem was detected
            <div>
                Please
                <a href="https://gracious.tech/support/stello/">LET US KNOW</a>
                and then
                <button onclick="location.assign('#/');location.reload()">
                    RELOAD
                </button>
            </div>
        </div>
    `)
}


// Setup Rollbar
Vue.prototype.$rollbar = new Rollbar({
    transmit: import.meta.env.MODE === 'production',  // Call handlers but don't transmit in dev
    environment: import.meta.env.MODE,
    accessToken: import.meta.env.VITE_ROLLBAR_APP,
    captureUncaught: true,
    captureUnhandledRejections: true,
    autoInstrument: false,  // SECURITY Don't track use via telemetry to protect privacy
    uncaughtErrorLevel: 'critical',  // Default to critical (shows fail bar)
    payload: {
        // Version must be within payload prop (https://github.com/rollbar/rollbar.js/issues/842)
        code_version: 'v' + app_config.version,  // 'v' to match git tags
    },
    // Below are regex strings that will have global & case-insensitive flags applied
    ignoredMessages: [
        // ResizeObserver errors are apparently harmless
        // https://stackoverflow.com/questions/49384120/#comment86691361_49384120
        'ResizeObserver loop limit exceeded',
    ],
    onSendCallback: (isUncaught, args, payload:any) => {

        // SECURITY Remove file paths in stack trace which may expose user's username
        // NOTE Windows uses forward slashes for file URLs, same as Linux and Mac
        // TODO debug = debug.replaceAll(/file\:\/\/\/.*\/app_dist\//g, '')

        // If critical (or dev) show fail bar
        if (payload.level === 'critical' || import.meta.env.MODE !== 'production'){
            show_fail_bar()
        }
    },
})


// Vue config
Vue.config.productionTip = false  // Don't show warning about running in development mode
Vue.config.errorHandler = (error:any, vm, info) => {
    // Errors within Vue components do not bubble up to Window and must be addressed separately
    // WARN Despite typings, error arg may be anything and not necessarily an Error instance
    // NOTE Vue's info arg says what part of Vue the error occured in (e.g. render/hook/etc)
    console.error(error)
    vm.$rollbar.critical(error, info)
}
Vue.config.warnHandler = (msg, vm, trace) => {
    // Vue will by default just log warnings, where as hard fail during dev is preferred
    const error = new Error(`VUE WARNING: ${msg}\n\n${trace}`)
    console.error(error)
    vm.$rollbar.error(error)  // Vue won't actually throw in production; this shows fail bar in dev
}


// Add global method for handling network errors
Vue.prototype.$network_error = function(error:any):void{
    // Handle network error at a UI level
    // TODO Also handle Google network errors etc
    if (error instanceof TypeError){
        this.$store.dispatch('show_snackbar',
            "Network error (please check your Internet connection)")
    } else {
        throw error
    }
}


// Default all Vuetify router links to exact matching for active class
//      Otherwise all nav buttons to shallower routes look selected (e.g. back arrows)
VuetifyRoutable.extendOptions.props.exact.default = true


// Plugins
Vue.use(Vuex)
Vue.use(VueRouter)
Vue.use(VueI18n)
Vue.use(Vuetify)


// Register global components
Vue.component('app-btn', AppBtn)
Vue.component('app-btn-checkbox', AppBtnCheckbox)
Vue.component('app-svg', AppSVG)
Vue.component('app-text', AppText)
Vue.component('app-html', AppHtml)
Vue.component('app-textarea', AppTextarea)
Vue.component('app-file', AppFile)
Vue.component('app-switch', AppSwitch)
Vue.component('app-select', AppSelect)
Vue.component('app-content', AppContent)
Vue.component('app-content-list', AppContentList)
Vue.component('app-integer', AppInteger)
Vue.component('app-password', AppPassword)
Vue.component('app-menu-more', AppMenuMore)
Vue.component('app-list-item', AppListItem)
Vue.component('app-security-icon', AppSecurityIcon)
Vue.component('app-security-alert', AppSecurityAlert)


// i18n
const i18n = new VueI18n({
    locale: 'en',
    fallbackLocale: 'en',
    // NOTE preserveDirectiveContent required to stop text disappearing before route animation ends
    preserveDirectiveContent: true,
    missing: (locale, path, vm) => {
        // Report missing i18n strings
        const error = new Error(`Missing i18n path: ${path} (${locale})`)
        console.error(error)
        vm.$rollbar.error(error)  // Won't show fail bar as not critical
    },
})


// Vuetify
const vuetify_theme = {
    primary: app_config.theme.primary,
    accent: app_config.theme.accent,
    error: app_config.theme.error,
    anchor: app_config.theme.accent,
}
// NOTE Colors same for both dark/light to keep branding consistent (and simpler sass!)
const vuetify = new Vuetify({
    theme: {themes: {dark: vuetify_theme, light: vuetify_theme}},
    icons: {
        values: {
            // Make Vuetify use custom icon component instead of icon fonts
            // Vuetify uses several defaults that can't be overriden within actual components
            //      https://vuetifyjs.com/en/customization/icons/#using-custom-icons
            delete: {component: AppSVG, props: {name: 'icon_close'}},  // remove chip
            checkboxOn: {component: AppSVG, props: {name: 'icon_checkbox_true'}},
            checkboxOff: {component: AppSVG, props: {name: 'icon_checkbox_false'}},
            checkboxIndeterminate: {component: AppSVG, props: {name: 'icon_checkbox_null'}},
            radioOn: {component: AppSVG, props: {name: 'icon_radio_checked'}},
            radioOff: {component: AppSVG, props: {name: 'icon_radio_unchecked'}},
            dropdown: {component: AppSVG, props: {name: 'icon_arrow_drop_down'}},
            complete: {component: AppSVG, props: {name: 'icon_done'}},
            expand: {component: AppSVG, props: {name: 'icon_expand_more'}},
            clear: {component: AppSVG, props: {name: 'icon_clear'}},
        },
    },
    lang: {
        // Override some default strings
        // TODO Integrate with i18n instead (Vuetify has a guide on doing so)
        locales: {
            en: {
                noDataText: "",  // Should show "create new" button or disable the field instead
            },
        },
    },
})


// Expose task manager in components
Vue.prototype.$tm = task_manager


// Init app (once db and store is ready)
open_db().then(async connection => {

    // Init database
    self._db = new Database(connection)

    // Init store
    // NOTE Can't just rely on self._app as some methods (like router guards) called before ready
    const store = await get_store(self._db)
    self._store = store

    // Init Vuetify dark setting based on store value
    vuetify.framework.theme.dark = store.state.dark

    // Debug helper for toggling theme (for manual calling in browser console)
    self._toggle_dark = () => store.dispatch('set_dark', !store.state.dark)

    // Init router
    const router = get_router(store)

    // Mount app
    const render = h => h(App)
    self._app = new Vue({store, router, i18n, vuetify, render}).$mount('#app')

    // Increment opens count
    self._store.commit('dict_set', ['usage_opens', self._store.state.usage_opens + 1])
    if (self._store.state.usage_installed === null){
        self._store.commit('dict_set', ['usage_installed', new Date()])
    }
})


// Init error reporting
import '@/services/errors'

// Third-party
import Vue, {CreateElement} from 'vue'
import Vuex from 'vuex'
import VueRouter from 'vue-router'
import VueI18n from 'vue-i18n'
import Vuetify from 'vuetify/lib'  // WARN Must import from /lib for tree shaking
import VuetifyRoutable from 'vuetify/lib/mixins/routable'

// Own modules
import '@/services/register_hooks'  // WARN Must come before any components imported
import app_config from '@/app_config.json'
import {Database, open_db} from '@/services/database/database'
import {get_store} from '@/services/store/store'
import {get_router} from '@/services/router'
import {NativeBrowser} from './services/native/native_browser'
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


// Create CSS variables for theme colors
for (const [key, value] of Object.entries(app_config.theme)){
    self.document.documentElement.style.setProperty(`--${key}`, value)
}


// Declare custom props on Vue instances
declare module "vue/types/vue" {
    interface Vue {
        $network_error:(error:unknown)=>void
        $tm:TaskManager
    }
}


// Set non-op native interface if none available
if (!self.app_native){
    self.app_native = new NativeBrowser()
}


// Show update bar if one available
self.app_update = () => {
    self.app_native.update()
}
self.app_native.on_update_ready(() => {
    // Remove any existing reload bar, as update restarts electron and would solve errors anyway
    self.document.querySelector('.reload-bar')?.remove()
    // Insert the bar
    self.document.body.insertAdjacentHTML('afterbegin', `
        <div class="reload-bar update">
            An update is ready to go with improvements
            <div>
                <button onclick="app_update()">
                    RESTART
                </button>
            </div>
        </div>
    `)
})


// Vue config
Vue.config.productionTip = false  // Don't show warning about running in development mode


// Add global method for handling network errors
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- (3rd party issue)
Vue.prototype.$network_error = function(error:unknown):void{
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- (3rd party issue)
VuetifyRoutable.extendOptions.props.exact.default = true


// Plugins
Vue.use(Vuex)
Vue.use(VueRouter)
Vue.use(VueI18n)
Vue.use(Vuetify)


// Register global components
Vue.component('AppBtn', AppBtn)
Vue.component('AppBtnCheckbox', AppBtnCheckbox)
Vue.component('AppSvg', AppSVG)
Vue.component('AppText', AppText)
Vue.component('AppHtml', AppHtml)
Vue.component('AppTextarea', AppTextarea)
Vue.component('AppFile', AppFile)
Vue.component('AppSwitch', AppSwitch)
Vue.component('AppSelect', AppSelect)
Vue.component('AppContent', AppContent)
Vue.component('AppContentList', AppContentList)
Vue.component('AppInteger', AppInteger)
Vue.component('AppPassword', AppPassword)
Vue.component('AppMenuMore', AppMenuMore)
Vue.component('AppListItem', AppListItem)
Vue.component('AppSecurityIcon', AppSecurityIcon)
Vue.component('AppSecurityAlert', AppSecurityAlert)


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
        self.app_report_error(error)
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- (3rd party issue)
Vue.prototype.$tm = task_manager


// Init app (once db and store is ready)
void open_db().then(async connection => {

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
    const render = (ce:CreateElement) => ce(App)
    self._app = new Vue({store, router, i18n, vuetify, render}).$mount('#app')

    // Increment opens count
    self._store.commit('dict_set', ['usage_opens', self._store.state.usage_opens + 1])
    if (self._store.state.usage_installed === null){
        self._store.commit('dict_set', ['usage_installed', new Date()])
    }
})


// Init error reporting
// NOTE All imported just to make sure non-exports don't get tree-shaken
import * as error_handling from '@/services/errors'

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
import {backup_contacts} from '@/services/backup/contacts'
import {get_backups_dir, save_all_messages} from '@/services/backup/generic'
import {setIntervalPlus} from '@/services/utils/async'

// Components
import App from '@/components/App.vue'
import AppA from '@/components/global/AppA.vue'
import AppBtn from '@/components/global/AppBtn.vue'
import AppBtnCheckbox from '@/components/global/AppBtnCheckbox.vue'
import AppSVG from '@/components/global/AppSVG.vue'
import AppBlob from '@/components/global/AppBlob.vue'
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
import '@/styles/fonts.css'
import 'dnm-croppr/dist/dnm-croppr.css'


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
self.app_native.on_update_ready(() => {
    // Remove any existing reload bar, as update restarts electron and would solve errors anyway
    self.document.querySelector('.reload-bar')?.remove()
    // Insert the bar
    self.document.body.insertAdjacentHTML('afterbegin', `
        <div class="reload-bar update">
            An update is ready to go with improvements
            <div>
                <button>RESTART</button>
            </div>
        </div>
    `)
    ;(self.document.querySelector('.reload-bar.update button') as HTMLButtonElement)
        .addEventListener('click', () => {
            self.app_native.restart_after_update()
            // Using normal close method ensures can close properly and wait for tasks to finish
            self.close()
        })
})


// Vue config
Vue.config.productionTip = false  // Don't show warning about running in development mode


// Add global method for handling network errors
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- (3rd party issue)
Vue.prototype.$network_error = function(error:unknown):void{
    // Handle network error at a UI level
    // TODO Also handle Google network errors etc
    if (error instanceof TypeError){
        console.debug(error)
        console.debug("(handled by $network_error)")
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
Vue.component('AppA', AppA)
Vue.component('AppBtn', AppBtn)
Vue.component('AppBtnCheckbox', AppBtnCheckbox)
Vue.component('AppSvg', AppSVG)
Vue.component('AppBlob', AppBlob)
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
    theme: {
        themes: {
            dark: {...vuetify_theme, warning: '#ffb74d'},
            light: {...vuetify_theme, warning: '#c56000'},
        },
    },
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
            unfold: {component: AppSVG, props: {name: 'icon_unfold_more'}},
            success: {component: AppSVG, props: {name: 'icon_check_circle'}},
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
    self.app_db = new Database(connection)

    // Init store
    // NOTE Can't just rely on self.app_vue as some methods (like router guards) called before ready
    const store = await get_store(self.app_db)
    self.app_store = store

    // Init Vuetify dark setting based on store value
    vuetify.framework.theme.dark = store.state.dark

    // Debug helper for toggling theme (for manual calling in browser console)
    self.app_toggle_dark = () => store.dispatch('set_dark', !store.state.dark)

    // Init router
    const router = get_router(store)

    // Mount app
    const render = (ce:CreateElement) => ce(App)
    self.app_vue = new Vue({store, router, i18n, vuetify, render}).$mount('#app')

    // Increment opens count
    self.app_store.commit('dict_set', ['usage_opens', self.app_store.state.usage_opens + 1])
    if (self.app_store.state.usage_installed === null){
        self.app_store.commit('dict_set', ['usage_installed', new Date()])
    }

    // Schedule backups
    // NOTE Contacts keeps ~3 backups, but messages only ever have one
    setTimeout(() => {
        setIntervalPlus(24, 'h', true, async () => {
            if (store.state.backups === 'none'){
                return  // Do nothing, but don't cancel interval in case later turned back on
            }
            await backup_contacts()
            if (store.state.backups === 'all'){
                await save_all_messages(get_backups_dir())
            }
        })
    }, 1000 * 30)  // Do initial backup 30 seconds after starting to not slow anything down

}).catch(error_handling.handle_db_error)

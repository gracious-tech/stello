
import VueRouter, {RouteConfig} from 'vue-router'
import {Store} from 'vuex'

import RouteRoot from '@/components/routes/RouteRoot.vue'
import RouteAbout from '@/components/routes/RouteAbout.vue'
import RouteSettings from '@/components/routes/RouteSettings.vue'
import RouteProfile from '@/components/routes/RouteProfile.vue'
import RouteStorage from '@/components/routes/RouteStorage.vue'
import RouteInvalid from '@/components/routes/RouteInvalid.vue'
import RouteContacts from '@/components/routes/RouteContacts.vue'
import RouteContact from '@/components/routes/RouteContact.vue'
import RouteDrafts from '@/components/routes/RouteDrafts.vue'
import RouteDraft from '@/components/routes/RouteDraft.vue'
import RouteDraftPage from '@/components/routes/RouteDraftPage.vue'
import RouteMessages from '@/components/routes/RouteMessages.vue'
import RouteMessage from '@/components/routes/RouteMessage.vue'
import RouteReplies from '@/components/routes/RouteReplies.vue'
import {AppStoreState} from '@/services/store/types'


// Route config
const routes:RouteConfig[] = [
    // WARN Order must match sidebar nav as animations automatically determined based on this
    {path: '/', component: RouteRoot},
    {path: '/drafts/', component: RouteDrafts},
    {path: '/drafts/:draft_id/', component: RouteDraft, name: 'draft', props: true},
    {path: '/drafts/:draft_id/*', component: RouteDraftPage, name: 'page', props: true},
    {path: '/messages/', component: RouteMessages},
    {path: '/messages/:msg_id/', component: RouteMessage, name: 'message', props: true},
    {path: '/replies/', component: RouteReplies},
    {path: '/contacts/', component: RouteContacts},
    {path: '/contacts/:contact_id/', component: RouteContact, name: 'contact', props: true},
    {path: '/settings/', component: RouteSettings},
    {path: '/settings/profiles/', redirect: '/settings/'},  // Embedded in RouteSettings
    {path: '/settings/profiles/:profile_id/', component: RouteProfile, name: 'profile', props:true},
    {path: '/settings/storage/', component: RouteStorage},
    {path: '/about/', component: RouteAbout},
    {path: '*', component: RouteInvalid},
]


// Make all routes strict (don't remove trailing slashes) and case-sensitive
// TODO Refactor after implemented https://github.com/vuejs/vue-router/issues/2404
for (const route of routes){
    route.pathToRegexpOptions = {strict: true, sensitive: true}
}


// Helper to init router once store is ready (as some navigation guards depend on it)
export function get_router(store:Store<AppStoreState>){

    // Init router
    const router = new VueRouter({
        routes,
        mode: 'hash',  // History mode doesn't work for file protocol
    })

    // NOTE Navigation guards are applied in order they are created

    router.beforeEach(call_next((to, from) => {

        // Redirect all non-trailing-slash URLs to trailing-slash version so ../ etc work correctly
        if (! to.path.endsWith('/')){
            if (import.meta.env.MODE === 'development'){
                // Redirection only for production (in case user modifies the URL themselves)
                throw new Error(`Target URL does not end with a slash: ${to.path}`)
            }
            const new_to = {...to}
            new_to.path += '/'
            return new_to
        }

        // Close any dialogs that are open (simplifies adding links in dialogs)
        if (store.state.tmp.dialog){
            store.state.tmp.dialog.resolve()
        }
    }))

    router.afterEach((to, from) => {
        // Keep record of prev route in store
        store.commit('tmp_set', ['prev_route', from])
    })

    return router
}


function call_next(guard){
    // Decorator to allow returning in a guard, rather than calling next()
    // Wrapped guard will only be given (to, from) and not `next`
    // NOTE Couldn't get working as method decorator in components
    return (to, from, next) => {
        next(guard(to, from))
    }
}

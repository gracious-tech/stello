
<template lang='pug'>

v-app(:class='app_classes')
    //- v-app will become .v-application > .v-application--wrap > ...
    //- Dialogs etc will be children of .v-application
    //- Transition will not appear in the DOM itself

    div.horizontal
        app-sidebar(v-if='docked === "router-view"')
        transition(:name='transition')
            //- WARN key important to stop Vue reusing a route when its params change
            component(:is='docked' :key='$route.fullPath' class='docked')

    app-status

    v-snackbar(v-model='snackbar_visible' timeout='6000')
        span(v-if='snackbar') {{ snackbar.msg }}
        template(#action v-if='snackbar')
            app-btn(v-if='snackbar.btn_handler' :color='snackbar.btn_color'
                @click='() => snackbar.btn_handler()') {{ snackbar.btn_label }}
            app-btn(v-else @click='snackbar_visible = false' icon='close'
                :light='$vuetify.theme.dark')

    app-dialog

</template>


<script lang='ts'>

import {Route} from 'vue-router'
import {Component, Vue, Watch} from 'vue-property-decorator'

import AppStatus from '@/components/other/AppStatus.vue'
import AppSidebar from '@/components/other/AppSidebar.vue'
import AppDialog from '@/components/dialogs/AppDialog.vue'
import SplashWelcome from '@/components/splash/SplashWelcome.vue'
import SplashDisclaimer from '@/components/splash/SplashDisclaimer.vue'
import {on_oauth} from '@/services/native/native'
import {oauth_pretask_process} from '@/services/tasks/oauth'
import {task_manager} from '@/services/tasks/tasks'
import {sleep} from '@/services/utils/async'
import {resume_tasks} from '@/services/tasks/resume'


@Component({
    components: {AppStatus, AppSidebar, SplashWelcome, SplashDisclaimer, AppDialog},
})
export default class extends Vue {

    route_transition:string = 'below'
    snackbar_visible:boolean = false
    snackbar:{msg:string, btn_label?:string, btn_color?:string, btn_handler?:()=>void} = null
    allow_force_quit:boolean = false

    async mounted(){
        // Prevent window close if still doing tasks
        self.addEventListener('beforeunload', event => {
            if (task_manager.data.tasks.length && !this.allow_force_quit){
                this.$store.dispatch('show_snackbar', {
                    msg: "Cannot close until tasks complete",
                    btn_label: "Force quit",
                    btn_color: 'error',
                    btn_handler: () => {
                        this.allow_force_quit = true
                        self.close()
                    },
                })
                event.returnValue = false  // Prevents close
            }
        })

        // Listen for oauth redirects
        on_oauth(oauth_pretask_process)

        // Resume tasks
        resume_tasks()
    }

    get docked(){
        // Show first item that wants to be shown
        const items = [
            ['splash-welcome', this.$store.state.show_splash_welcome],
            ['splash-disclaimer', this.$store.state.show_splash_disclaimer],
            ['router-view', true],
        ]
        return items.find(([component, show]) => show)[0]
    }

    get transition(){
        // Always below if transitioning with splashes
        return this.docked === 'router-view' ? this.route_transition : 'below'
    }

    get app_classes(){
        // Return classes for the component's root
        const classes = []
        if (this.$store.state.dark){
            classes.push('dark')
        }
        return classes
    }

    @Watch('$route') watch_$route(to:Route, from:Route){
        // Do a different transition depending on which routes going from/to

        // Work with raw paths (/path/:param/ rather than /path/value/)
        const to_path = to.matched[0].path
        const from_path = from.matched[0].path

        this.route_transition = (() => {

            // If going to the same path then a param has changed
            if (from_path === to_path)
                return 'below'

            // Root route (dashboard) is a special case and needs manual handling
            if (from_path === '/')
                return 'below'
            if (to_path === '/')
                return 'above'

            // Handle transitions within same branch
            if (to_path.startsWith(from_path))
                return 'deeper'
            if (from_path.startsWith(to_path))
                return 'shallower'

            // Moving branch, so detect is going above or below based on order of routes
            const paths = this.$router.options.routes.map(item => item.path)
            return paths.indexOf(to_path) > paths.indexOf(from_path) ? 'below' : 'above'

        })()
    }

    @Watch('$store.state.tmp.snackbar') async watch_snackbar(arg){
        // Listen to changes to snackbar state and handle its display
        if (this.snackbar_visible){
            // Another message already showing so trigger close and wait a moment
            this.snackbar_visible = false
            await sleep(500)
        }
        this.snackbar = arg
        this.snackbar_visible = !!arg
    }
}
</script>


<style lang='sass' scoped>

// Give app background a primary color tinge
// NOTE Looks better (especially for dark theme) and helps toolbars etc stand out more


::v-deep .v-application--wrap
    // Add to wrap so complements v-app's default background (works for both light and dark)
    background-color: rgba($primary, 0.08)


// Keyframes for router transition animations

@keyframes slide-left-enter
    from
        transform: translateX(100%)
    to
        transform: translateX(0)

@keyframes slide-left-leave
    from
        transform: translateX(0)
    to
        transform: translateX(-100%)

@keyframes slide-right-enter
    from
        transform: translateX(-100%)
    to
        transform: translateX(0)

@keyframes slide-right-leave
    from
        transform: translateX(0)
    to
        transform: translateX(100%)

@keyframes slide-up-enter
    from
        transform: translateY(100%)
    to
        transform: translateY(0)

@keyframes slide-up-leave
    from
        transform: translateY(0)
    to
        transform: translateY(-100%)

@keyframes slide-down-enter
    from
        transform: translateY(-100%)
    to
        transform: translateY(0)

@keyframes slide-down-leave
    from
        transform: translateY(0)
    to
        transform: translateY(100%)


// Route layout and transitions

.horizontal
    display: flex
    flex-grow: 1
    height: 1px  // WARN Important for stopping tasks toolbar disappearing

.docked
    display: flex
    flex-direction: column
    flex-grow: 1
    overflow-x: hidden  // Stops growing out of container (e.g. when very long word in content)
    // Defaults for all transition animations
    animation-duration: 375ms
    animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1)

    &.deeper-enter-active
        animation-name: slide-left-enter

    &.deeper-leave-active
        animation-name: slide-left-leave

    &.shallower-enter-active
        animation-name: slide-right-enter

    &.shallower-leave-active
        animation-name: slide-right-leave

    &.above-enter-active
        animation-name: slide-down-enter

    &.above-leave-active
        animation-name: slide-down-leave

    &.below-enter-active
        animation-name: slide-up-enter

    &.below-leave-active
        animation-name: slide-up-leave

    // Need to absolute position a route when it's leaving so entering route not displaced
    &.deeper-leave-active, &.shallower-leave-active, &.above-leave-active, &.below-leave-active
        position: absolute
        width: 100%  // Needed because of absolute, but doesn't take into account sidebar
        padding-left: $stello_sidebar_width  // Take into account sidebar


// Snackbar


// Give snackbar more spacing (defaults 8px)
::v-deep .v-snack__wrapper
    left: 16px
    right: 16px
    bottom: 120px  // Raise from bottom since may not be noticed down there on desktop


// Snackbar doesn't support dark theme (should be light colored to stand out)
.dark ::v-deep .v-snack__wrapper
    background-color: white
    color: rgba(black, map-get($material-light, 'primary-text-percent'))


</style>

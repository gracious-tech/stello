
<template lang='pug'>

v-app(:class='app_classes')
    //- v-app will become .v-application > .v-application--wrap > ...
    //- Dialogs etc will be children of .v-application
    //- Transition will not appear in the DOM itself

    div.horizontal
        app-sidebar(v-if='docked === "router-view"')
        transition(:name='transition')
            component(:is='docked' class='docked')

    app-status

    v-snackbar(v-model='snackbar' timeout='6000')
        | {{ $store.state.tmp.snackbar_text }}
        template(#action)
            app-btn(@click='close_snackbar' icon='close' :light='$vuetify.theme.dark')

    app-dialog

</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'

import AppStatus from '@/components/other/AppStatus.vue'
import AppSidebar from '@/components/other/AppSidebar.vue'
import AppDialog from '@/components/dialogs/AppDialog.vue'
import SplashWelcome from '@/components/splash/SplashWelcome.vue'
import SplashDisclaimer from '@/components/splash/SplashDisclaimer.vue'
import {update_configs} from '@/services/configs'


@Component({
    components: {AppStatus, AppSidebar, SplashWelcome, SplashDisclaimer, AppDialog},
})
export default class extends Vue {

    route_transition = 'jump'

    async mounted(){
        // Prevent window close if still doing tasks
        self.addEventListener('beforeunload', event => {
            if (this.$store.getters.active_tasks.length){
                this.$store.dispatch('show_snackbar', "Cannot close until tasks complete")
                event.returnValue = false  // Prevents close
            }
        })

        // Upload configs if they failed to update earlier
        for (const profile of await self._db.profiles.list()){
            if (profile.configs_need_uploading){
                update_configs(await this.$store.dispatch('new_task'), profile)
            }
        }

        // Check for new responses now and routinely
        const check_for_responses = () => {
            this.$store.dispatch('check_for_responses')
        }
        check_for_responses()
        setInterval(check_for_responses, 1000 * 60 * 15)  // 15 mins
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
        // Always jump if transitioning with splashes
        return this.docked === 'router-view' ? this.route_transition : 'jump'
    }

    get app_classes(){
        // Return classes for the component's root
        const classes = []
        if (this.$store.state.dark){
            classes.push('dark')
        }
        return classes
    }

    get snackbar(){
        return this.$store.state.tmp.snackbar
    }
    set snackbar(value){
        this.$store.commit('tmp_set', ['snackbar', value])
    }

    @Watch('$route') watch_$route(to, from){
        // Do a different transition depending on which routes going from/to
        if (to.path.startsWith(from.path)){
            this.route_transition = 'deeper'
        } else if (from.path.startsWith(to.path)){
            this.route_transition = 'shallower'
        } else {
            this.route_transition = 'jump'
        }
    }

    close_snackbar(){
        this.snackbar = false
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

    &.jump-enter-active
        animation-name: slide-up-enter

    &.jump-leave-active
        animation-name: slide-up-leave

    // Need to absolute position a route when it's leaving so entering route not displaced
    &.deeper-leave-active, &.shallower-leave-active, &.jump-leave-active
        position: absolute
        width: 100%


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


<template lang='pug'>

div
    v-toolbar
        v-toolbar-title Settings

    app-content(class='pa-6')

        RouteSettingsProfiles

        hr(class='mt-16')

        RouteSettingsContacts

        hr(class='mt-16')

        h1(class='text-h6') Preferences
        app-switch(v-model='dark' label="Dark theme" label_false="Light theme")

        hr(class='mt-16')

        h1(class='text-subtitle-1 text--secondary') Technical tools
        p(class='my-4')
            app-btn(to='storage/' color='' small) Storage manager

        hr(class='mt-16')

        v-alert(v-if='show_help' color='warning' outlined class='text-center')
            | Find most settings within your sending account above
            br
            small (such as notification preferences, message appearance, and security settings)
        div(v-else class='text-center')
            app-btn(@click='show_help = true' outlined) More settings

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import RouteSettingsProfiles from './assets/RouteSettingsProfiles.vue'
import RouteSettingsContacts from './assets/RouteSettingsContacts.vue'


@Component({
    components: {RouteSettingsProfiles, RouteSettingsContacts},
})
export default class extends Vue {

    show_help = false

    get dark(){
        return this.$store.state.dark
    }

    set dark(value){
        void this.$store.dispatch('set_dark', value)
    }

}

</script>


<style lang='sass' scoped>


</style>

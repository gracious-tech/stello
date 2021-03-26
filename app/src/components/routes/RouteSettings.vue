
<template lang='pug'>

div
    v-toolbar
        v-toolbar-title Settings

    app-content(class='pa-6')

        h1(class='text-h6') Preferences
        v-switch(v-model='dark' label="Dark theme" color='accent' persistent-hint
            hint="Use dark colors for the app's background which are easier on the eyes at night especially")

        hr(class='mt-16')

        RouteSettingsProfiles

        hr(class='mt-16')

        RouteSettingsContacts

        hr(class='mt-16')

        h1(class='text-subtitle-1 text--secondary') Technical tools
        p(class='my-4')
            app-btn(to='storage/' color='' small) Storage manager

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import RouteSettingsProfiles from './assets/RouteSettingsProfiles.vue'
import RouteSettingsContacts from './assets/RouteSettingsContacts.vue'


@Component({
    components: {RouteSettingsProfiles, RouteSettingsContacts},
})
export default class extends Vue {

    get dark(){
        return this.$store.state.dark
    }

    set dark(value){
        this.$store.dispatch('set_dark', value)
    }

}

</script>


<style lang='sass' scoped>


</style>

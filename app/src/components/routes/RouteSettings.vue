
<template lang='pug'>

div
    v-toolbar
        v-toolbar-title Settings

    app-content(class='pa-6')

        div.note
            div(class='text-body-2 app-bg-primary-relative')
                app-svg(name='icon_info' class='mr-3')
                | Most settings are in sending accounts

        RouteSettingsProfiles

        hr(class='mt-16')

        RouteSettingsContacts

        hr(class='mt-16')

        h1(class='text-h6') Preferences
        app-switch(v-model='dark' label="Dark theme" hint="Use dark colors for user interface")

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
        void this.$store.dispatch('set_dark', value)
    }

}

</script>


<style lang='sass' scoped>


.note
    margin-bottom: 36px
    text-align: center

    > div
        padding: 6px 12px
        border-radius: 24px
        display: inline-flex
        align-items: center


</style>

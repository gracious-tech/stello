
<template lang='pug'>

div
    v-toolbar
        v-toolbar-title Settings

    app-content(class='pa-6')

        RouteSettingsProfiles

        hr(class='mt-16')

        RouteSettingsContacts

        hr(class='mt-16')

        h1(class='text-h5 mb-4') Preferences
        app-switch(v-model='dark' label="Dark theme" label_false="Light theme")

        hr(class='mt-16')

        h1(class='text-h5 mb-4') Backups
        p(v-if='cloudbackup === "all"' class='text--secondary')
            | Stello is backing up your data to Google Drive.
        p(v-else-if='cloudbackup === "database"' class='text--secondary')
            | Stello is backing up your database to Google Drive,
            |  #[strong(class='warning--text') but not your images or files.]
        p(v-else class='text--secondary')
            | #[strong(class='warning--text') Stello does not backup your data online],
            |  so ensure you have your own system setup or use Stello's Google Drive option.
        div
            app-btn(to='/settings/backup/') Backup &amp; Restore Options

        hr(class='mt-16')

        RouteSettingsExport

        hr(class='mt-16')

        template(v-if='show_more')

            h1(class='text-subtitle-1 text--secondary') Technical tools
            p(class='my-4')
                app-btn(to='storage/' color='' small) Storage manager

            hr(class='mt-16')

            v-alert(color='warning' outlined class='text-center')
                | Find most settings by clicking on your sending account above
                br
                small (such as notification preferences, message appearance, and security settings)

        div(v-else class='text-center')
            app-btn(@click='show_more = true' outlined) More settings

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import RouteSettingsProfiles from './assets/RouteSettingsProfiles.vue'
import RouteSettingsContacts from './assets/RouteSettingsContacts.vue'
import RouteSettingsExport from './assets/RouteSettingsExport.vue'
import {AppStoreState} from '@/services/store/types'


@Component({
    components: {RouteSettingsProfiles, RouteSettingsContacts, RouteSettingsExport},
})
export default class extends Vue {

    show_more = false

    get cloudbackup():'database'|'all'|null{
        // Current Google Drive backup mode (null if not configured or oauth missing)
        const state = this.$store.state as AppStoreState
        if (!state.storage_oauth){
            return null
        }
        return state.cloudbackup
    }

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

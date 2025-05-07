
<template lang='pug'>

div
    v-toolbar
        v-toolbar-title Settings

    app-content(class='pa-6')

        RouteSettingsProfiles

        hr(class='mt-16')

        RouteSettingsContacts

        hr(class='mt-16')

        h1(class='text-h6 mb-4') Preferences
        app-switch(v-model='dark' label="Dark theme" label_false="Light theme")

        hr(class='mt-16')

        h1(class='text-h6 mb-4') Backup
        p(class='text-body-2') Stello uses a database that can lose data if your harddrive becomes full. To mitigate this risk, it will automatically backup the latest copy of your contacts and messages into the "Stello Files" folder. This is kept offline and exists on your device only. You should still regularly backup your whole computer yourself as data cannot be recovered from Stello sending accounts.
        v-radio-group(v-model='backups' row label="Auto-backup:")
            v-radio(label="None" value='none' color='accent')
            v-radio(label="Contacts" value='contacts' color='accent')
            v-radio(label="Contacts & Messages" value='all' color='accent')
        div(class='mb-4')
            app-btn(@click='export_contacts') Export Contacts
        v-alert(v-if='export_msg' color='info') {{ export_msg }}

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
import {save_contacts_to_dir} from '@/services/backup/contacts'


@Component({
    components: {RouteSettingsProfiles, RouteSettingsContacts},
})
export default class extends Vue {

    show_more = false
    export_msg = ''

    get dark(){
        return this.$store.state.dark
    }

    set dark(value){
        void this.$store.dispatch('set_dark', value)
    }

    get backups(){
        return this.$store.state.backups
    }

    set backups(value:'none'|'contacts'|'all'){
        this.$store.commit('dict_set', ['backups', value])
    }

    async export_contacts(){

        // Clear any previous export
        const export_dir = 'Exported/Contacts'
        await self.app_native.user_file_remove(export_dir)

        // Save contacts to export dir
        this.export_msg = `Contacts are exported to "Stello Files/${export_dir}"`
        void save_contacts_to_dir(export_dir)
    }

}

</script>


<style lang='sass' scoped>


</style>

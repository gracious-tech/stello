
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
            app-btn(@click='export_contacts' :disabled='export_ing') Export Contacts
            app-btn(@click='export_messages' :disabled='export_ing') Export Messages
        v-alert(v-if='export_ing || export_msg' :color='export_success ? "primary" : "error"'
                class='text-center')
            v-progress-circular(v-if='export_ing' indeterminate)
            div(v-else) {{ export_msg }}
        div(class='caption opacity-secondary')
            div #[strong Stello Files location:] {{ files_dir }}
            div #[strong Internal Data location:] {{ data_dir }}

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
import {save_all_messages} from '@/services/backup/generic'


@Component({
    components: {RouteSettingsProfiles, RouteSettingsContacts},
})
export default class extends Vue {

    show_more = false

    export_ing = false
    export_success = true
    export_msg = ''

    files_dir = ''
    data_dir = ''

    created(){
        // This may not be available until init.ts finishes, so get during create
        const native_paths = self.app_native.get_paths()
        this.files_dir = native_paths.files_dir
        this.data_dir = native_paths.data_dir
    }

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
        this.export_ing = true
        this.export_success = true
        try {
            const export_dir = 'Exported/Contacts'
            await self.app_native.user_file_remove(export_dir)  // Clear previous
            await save_contacts_to_dir(export_dir)
            this.export_msg = `Contacts exported to "Stello Files/${export_dir}"`
        } catch (error){
            this.export_success = false
            this.export_msg = "Failed to export contacts."
            self.app_report_error(error)
        }
        this.export_ing = false
    }

    async export_messages(){
        this.export_ing = true
        this.export_success = true
        try {
            const export_dir = 'Exported'  // Save method creates multiple subdirs
            const failed_titles = await save_all_messages(export_dir)
            this.export_msg = `Messages exported to "Stello Files/${export_dir}"`
            if (failed_titles.length){
                this.export_success = false
                const ts = failed_titles.map(t => `"${t}"`).slice(0, 3).join(', ')
                this.export_msg = `Could not export some messages, such as: ${ts}`
            }
        } catch (error){
            this.export_success = false
            this.export_msg = "Failed to export messages."
            self.app_report_error(error)
        }
        this.export_ing = false
    }
}

</script>


<style lang='sass' scoped>


</style>

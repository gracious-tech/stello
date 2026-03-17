
<template lang='pug'>

div
    h1(class='text-h6 mb-4') Backup
    p(class='text-body-2') Stello uses a database that can lose data if your harddrive becomes full. To mitigate this risk, it will automatically backup the latest copy of your contacts and messages into the "Stello Files" folder. This is kept offline and exists on your device only. You should still regularly backup your whole computer yourself as data cannot be recovered from Stello sending accounts.
    v-radio-group(v-model='backups' row label="Auto-backup:")
        v-radio(label="None" value='none' color='accent')
        v-radio(label="Contacts" value='contacts' color='accent')
        v-radio(label="Contacts & Messages" value='all' color='accent')
    div(class='caption opacity-secondary')
        div #[strong Stello Files location:] {{ files_dir }}
        div #[strong Internal Data location:] {{ data_dir }}

    h2(class='text-h6 my-4') Restore from backup
    p(class='text-body-2') Stello automatically backs up its database, which you can restore from the backups folder at:<br>"Stello Files/Backups [...]/database.json".
    div(class='mb-4')
        app-file(@input='import_db' accept='.json' :disabled='import_ing') Import Database
    v-alert(v-if='import_ing || import_msg' :color='import_success ? "primary" : "error"'
            class='text-center')
        v-progress-circular(v-if='import_ing' indeterminate)
        div.result-msg(v-else) {{ import_msg }}

    hr(class='mt-16')

    h1(class='text-h6 mb-4') Export Data
    p(class='text-body-2') You can export all your contacts and messages so you can switch to a different newsletter system, or simply view them outside of Stello.
    div(class='mb-4')
        app-btn(@click='export_contacts' :disabled='export_ing') Export Contacts
        app-btn(@click='export_messages' :disabled='export_ing') Export Messages
    v-alert(v-if='export_ing || export_msg' :color='export_success ? "primary" : "error"'
            class='text-center')
        v-progress-circular(v-if='export_ing' indeterminate)
        div.result-msg(v-else) {{ export_msg }}

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import {save_contacts_to_dir} from '@/services/backup/contacts'
import {save_all_messages} from '@/services/backup/generic'
import {import_database} from '@/services/backup/database'


@Component({})
export default class extends Vue {

    import_ing = false
    import_success = true
    import_msg = ''

    export_ing = false
    export_success = true
    export_msg = ''

    files_dir = ''
    data_dir = ''
    sep = '/'

    created(){
        // This may not be available until init.ts finishes, so get during create
        const native_paths = self.app_native.get_paths()
        this.files_dir = native_paths.files_dir
        this.data_dir = native_paths.data_dir
        this.sep = native_paths.sep
    }

    get backups(){
        return this.$store.state.backups
    }

    set backups(value:'none'|'contacts'|'all'){
        this.$store.commit('dict_set', ['backups', value])
    }

    async import_db(file:File){
        this.import_ing = true
        this.import_success = true
        try {
            const buffer = await file.arrayBuffer()
            const {added, skipped} = await import_database(buffer)
            this.import_msg = `Imported ${added} records (${skipped} already existed)`
        } catch (error){
            this.import_success = false
            this.import_msg = "Failed to import database."
            self.app_report_error(error)
        }
        this.import_ing = false
    }

    async export_contacts(){
        this.export_ing = true
        this.export_success = true
        const export_dir = `Exported${this.sep}Contacts`
        try {
            await self.app_native.user_file_remove(export_dir)  // Clear previous
            await save_contacts_to_dir(export_dir)
            this.export_msg = `Contacts exported to\n${this.files_dir}${this.sep}${export_dir}`
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
        const export_dir = 'Exported'  // Save method creates multiple subdirs
        try {
            const failed_titles = await save_all_messages(export_dir)
            this.export_msg = `Messages exported to\n${this.files_dir}${this.sep}${export_dir}`
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

.result-msg
    white-space: pre-wrap
    overflow-wrap: anywhere

</style>


<template lang='pug'>

div
    h1(class='text-h5 mb-4') Export Data
    p(class='text--secondary') Export all your contacts and messages so you can
        |  switch to a different newsletter system, or simply view them outside of Stello.
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


@Component({})
export default class extends Vue {

    export_ing = false
    export_success = true
    export_msg = ''

    files_dir = ''
    sep = '/'

    created(){
        // This may not be available until init.ts finishes, so get during create
        const native_paths = self.app_native.get_paths()
        this.files_dir = native_paths.files_dir
        this.sep = native_paths.sep
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

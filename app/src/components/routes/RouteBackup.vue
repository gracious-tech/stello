
<template lang='pug'>

div
    v-toolbar
        app-btn(to='../' icon='arrow_back')
        v-toolbar-title Backups

    app-content(class='pa-5 pt-12')
        p Stello keeps your data on your own computer for your security, in the "Stello Files"
            |  folder. Please note that sending accounts are for sending messages only
            |  and cannot be used to recover your data.
        p #[strong(class='warning--text') So if you lose your computer, you lose all your data.]
        p For this reason, you should ensure you have your own system for backing up your computer,
            |  or else enable backups to Google Drive below.

        hr(class='mt-16')

        h1(class='text-h5 mt-8 mb-2') Your own backups
        p Stello stores all of your data in the following location:
        p(class='opacity-secondary ml-6')
            strong {{ files_dir }}
        p To backup the data or change computer, you can simply copy this folder.
        p If you move this folder (while Stello is closed) Stello will ask where you put it,
            |  allowing you to store it in a custom location (such as an external harddrive).
        v-alert(type='warning' text class='mt-4')
            | Do not move the "Stello Files" folder while Stello is running.
        v-alert(v-if='data_dir_outside' type='warning' text class='mt-4')
            p Your Internal Data is stored outside the "Stello Files" folder due to starting with an
                |  older version of Stello.
                |  However, this is not an issue as Stello keeps a backup of it within
                |  "Stello Files". You do not need to do anything.
            div #[strong Internal Data location:] {{ data_dir }}

        hr(class='mt-16')

        h1(class='text-h5 mt-8 mb-2') Auto-export
        p You can automatically export contacts and messages to files that can
            |  be read by any software. These will be stored in a "Backups" folder within "Stello Files". If anything happens to Stello, this ensures you still have a
            |  record of everything.
            br
            |  (Stello will always backup its own database, even if auto-export is disabled.)
        v-radio-group(v-model='backups' row label="Auto-export:")
            v-radio(label="None" value='none' color='accent')
            v-radio(label="Contacts" value='contacts' color='accent')
            v-radio(label="Contacts & Messages" value='all' color='accent')
        p(class='text--secondary') You may like to disable this to save some disk space if you are
            |  confident your data is being backed up properly.

        hr(class='mt-16')

        h1(class='text-h5 mt-8 mb-2') Backup to Google Drive
        p Stello can periodically save its database and files to Google Drive.
            |  If you add a password, the backup will be end-to-end encrypted and unreadable
            |  by Google.
        div(class='mt-4')
            template(v-if='!cloudbackup_oauth')
                app-btn(@click='open_cloudbackup_dialog') Backup to Google Drive
            template(v-else)
                p Backing up to Google Drive account {{ cloudbackup_oauth.email }}
                template(v-if='!cloudbackup_enabled')
                    app-btn(@click='open_cloudbackup_dialog') Enable Backup
                    app-btn(@click='disable_cloudbackup') Disconnect
                p(v-else-if='cloudbackup_last' class='text-body-2 opacity-secondary')
                    | Last backed up: {{ cloudbackup_last }}
                v-radio-group(v-if='cloudbackup_enabled' v-model='cloudbackup_level' row
                        label="What to back up:" class='mt-0')
                    v-radio(:label='`Everything (${size_estimates.all})`'
                        value='all' color='accent')
                    v-radio(:label='`Everything except images/files (${size_estimates.database})`'
                        value='database' color='accent')
                div
                    app-btn(@click='backup_now') Backup Now
                    app-btn(@click='disable_cloudbackup') Disable

        hr(class='mt-16')

        h1(class='text-h5 mt-8 mb-2') Restore data

        h2(class='text-h6 text--secondary mb-2 mt-6') I backed up to Google Drive
        p It's better to copy the "Stello Files" folder if you can, as it will include all your
            |  files and latest changes. If it's no longer available, restore from Google Drive:
        div
            app-btn(@click='open_restore_dialog') Restore from Google Drive

        h2(class='text-h6 text--secondary mb-2 mt-6') I have a copy of "Stello Files"
        p You'll need to remove the "Stello Files" folder that Stello creates when it first opens
            |  (which contains the data you can currently see)
            |  and replace it with your backed up version.
        ol(class='mb-3')
            li Close Stello
                br
                span(class='text--secondary text-body-2')
                    | (Mac users must ensure it isn't still running in the Dock)
            li Remove the current folder at: #[strong {{ files_dir }}]
            li Replace it with your backed up folder
        p Stello may appear empty at first but should show a message in the Dashboard offering to
            |  restore your data for you. If the option doesn't appear, you can try and import the
            |  database backup directly which will be within "Stello Files",
            |  but it will not include your images etc.
        div(class='opacity-secondary ml-6 mb-4')
            | #[strong Find this file:] Stello Files{{ sep }}Backups [...]{{ sep }}database.json
        div(class='mb-4 d-flex align-center')
            app-file(@input='import_db' accept='.json' :disabled='import_ing' color='nomatch')
                | Manually Import Database
            div(class='warning--text') (use only if needed)

        v-alert(v-if='import_ing || import_msg' :color='import_success ? "primary" : "error"'
                class='text-center')
            v-progress-circular(v-if='import_ing' indeterminate)
            div.result-msg(v-else) {{ import_msg }}

</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'

import {import_database} from '@/services/backup/database'
import {OAuth} from '@/services/database/oauths'
import {AppStoreState} from '@/services/store/types'
import {oauth_revoke_if_obsolete} from '@/services/tasks/oauth'
import {task_manager} from '@/services/tasks/tasks'
import {drive_wipe_all_google, cloudbackup_size_estimates} from '@/services/tasks/cloudbackup'
import DialogGenericConfirm from '@/components/dialogs/generic/DialogGenericConfirm.vue'
import DialogCloudbackupSetup from '@/components/dialogs/specific/DialogCloudbackupSetup.vue'
import DialogCloudbackupRestore from '@/components/dialogs/specific/DialogCloudbackupRestore.vue'


@Component({})
export default class extends Vue {

    import_ing = false
    import_success = true
    import_msg = ''

    cloudbackup_oauth:OAuth|null = null

    files_dir = ''
    data_dir = ''
    sep = '/'

    size_estimates:{database:string, all:string} = {database: '', all: ''}

    created(){
        // This may not be available until init.ts finishes, so get during create
        const native_paths = self.app_native.get_paths()
        this.files_dir = native_paths.files_dir
        this.data_dir = native_paths.data_dir
        this.sep = native_paths.sep

        // Fetch size estimates for each backup level
        void cloudbackup_size_estimates().then(sizes => {
            this.size_estimates = sizes
        })
    }

    @Watch('$store.state.storage_oauth', {immediate: true})
    async watch_storage_oauth(id:string|null){
        this.cloudbackup_oauth = id ? (await self.app_db.oauths.get(id) ?? null) : null
    }

    get data_dir_outside(){
        // Stello used to keep internal data in an OS-specific location
        return !this.data_dir.startsWith(this.files_dir)
    }

    get cloudbackup_enabled():boolean{
        return !!(this.$store.state as AppStoreState).cloudbackup
    }

    get cloudbackup_last():string|null{
        const date = this.$store.state.cloudbackup_last as Date|null
        return date?.toLocaleString() ?? null
    }

    get backups(){
        return this.$store.state.backups
    }

    set backups(value:'none'|'contacts'|'all'){
        this.$store.commit('dict_set', ['backups', value])
    }

    get cloudbackup_level():'database'|'all'|null{
        return (this.$store.state as AppStoreState).cloudbackup
    }

    set cloudbackup_level(value:'database'|'all'|null){
        // Save and kick off a sync so the changed level takes effect immediately
        this.$store.commit('dict_set', ['cloudbackup', value])
        void task_manager.start('cloudbackup_sync')
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

    backup_now(){
        void task_manager.start('cloudbackup_sync')
    }

    open_cloudbackup_dialog(){
        void this.$store.dispatch('show_dialog', {component: DialogCloudbackupSetup})
    }

    open_restore_dialog(){
        void this.$store.dispatch('show_dialog', {component: DialogCloudbackupRestore})
    }

    async disable_cloudbackup(){

        // Confirm with user before continuing
        const confirmed = await this.$store.dispatch('show_dialog', {
            component: DialogGenericConfirm,
            props: {
                title: "Disable Backup to Google Drive",
                text: "This will also delete the backup files from Google Drive.",
                confirm: 'Disable',
                confirm_danger: true,
            },
        }) as boolean|undefined
        if (!confirmed)
            return

        // Disable in settings and then trigger tasks
        const oauth = this.cloudbackup_oauth  // WARN Keep copy before triggering change
        this.$store.commit('dict_set', ['storage_oauth', null])
        this.$store.commit('dict_set', ['cloudbackup', null])
        this.$store.commit('dict_set', ['cloudbackup_key', null])
        this.$store.commit('dict_set', ['cloudbackup_last', null])
        if (oauth){
            // Best-effort wipe — notify user if it fails so they can delete manually
            drive_wipe_all_google(oauth).catch(() => {
                void this.$store.dispatch('show_snackbar',
                    "Could not delete backup from Google Drive — please delete it manually")
            })
            void oauth_revoke_if_obsolete(oauth)
        }
    }
}

</script>


<style lang='sass' scoped>

.result-msg
    white-space: pre-wrap
    overflow-wrap: anywhere

</style>

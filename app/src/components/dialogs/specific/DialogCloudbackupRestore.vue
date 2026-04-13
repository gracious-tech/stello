
<template lang='pug'>

v-card
    v-card-title Restore from Google Drive

    v-card-text
        div(v-if='progress' class='text-center my-4')
            v-progress-circular(indeterminate)
        v-alert(v-else-if='result_msg'
                :color='result_success ? "primary" : "error"' class='text-center')
            | {{ result_msg }}
        template(v-else)
            p(class='text-body-2')
                | This will restore data you have previously backed up to Google Drive.
                |  You can use it to recover data after losing access to it.
            v-text-field(v-model='password_input' label='Your Password' type='password'
                hint="The one you used when you first setup backups to Google Drive.")

    v-card-actions
        app-btn(@click='dismiss' :disabled='progress')
            | {{ result_msg ? 'Close' : 'Cancel' }}
        app-btn(v-if='!progress && !result_success' @click='start_restore')
            | {{ storage_oauth ? 'Restore' : 'Connect &amp; Restore' }}

</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'

import {oauth_pretask_new_usage} from '@/services/tasks/oauth'
import {cloudbackup_restore_direct} from '@/services/tasks/cloudbackup'
import {MustReauthenticate, MustReconnect, MustWait} from '@/services/utils/exceptions'


@Component({})
export default class extends Vue {

    password_input = ''
    progress = false
    result_success = false
    result_msg = ''

    get storage_oauth():string|null{
        // The OAuth id for cloud storage, if already connected
        return this.$store.state.storage_oauth as string|null
    }

    @Watch('storage_oauth')
    on_storage_oauth(oauth_id:string|null){
        // When OAuth becomes available after connecting, proceed with restore
        if (oauth_id && !this.result_msg){
            void this.run_restore(oauth_id)
        }
    }

    start_restore(){
        // If already connected, restore directly
        if (this.storage_oauth){
            void this.run_restore(this.storage_oauth)
            return
        }
        // Otherwise initiate OAuth setup (connect only, no sync)
        // NOTE Don't set progress here so the user can retry if they close the browser window
        void oauth_pretask_new_usage('storage_oauth_setup', [], 'google')
    }

    async run_restore(oauth_id:string){
        // Run the restore directly without the task manager
        this.progress = true
        try {
            const {added, skipped} = await cloudbackup_restore_direct(
                oauth_id, this.password_input)
            this.result_success = true
            this.result_msg =
                `Restored ${added} records (${skipped} already existed)`
        } catch (error){
            this.result_success = false
            if (error instanceof MustReconnect){
                this.result_msg = "Could not connect — check your internet connection"
                    + " and try again."
            } else if (error instanceof MustReauthenticate){
                // Token expired or permission revoked — clear OAuth so user can reconnect manually
                this.result_msg = "Your Google sign-in has expired. Please connect again."
                self.app_store.commit('dict_set', ['storage_oauth', null])
            } else if (error instanceof MustWait){
                this.result_msg = "Google Drive is temporarily limiting requests."
                    + " Please wait a few minutes and try again."
            } else if (error instanceof Error){
                // Errors thrown directly by cloudbackup_restore_direct already carry a user message
                // (e.g. "Incorrect password", "No backup metadata found")
                this.result_msg = error.message
            } else {
                this.result_msg = "Failed to restore backup"
                self.app_report_error(error)
            }
        }
        this.progress = false
    }

    dismiss(){
        this.$emit('close')
    }
}

</script>

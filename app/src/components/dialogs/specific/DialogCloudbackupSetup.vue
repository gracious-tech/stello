
<template lang='pug'>

v-card
    v-card-title {{ title }}

    v-card-text
        template(v-if='different_db')
            | The existing backup belongs to a different database. To continue, the backup must
            |  be wiped and started fresh. This cannot be undone.
        template(v-else)
            p(v-if='!connected' class='text-body-2')
                | Back up to a private area of your Google Drive that only this app can access. You may optionally encrypt the data so Google cannot access it, but the data cannot be recovered if you forget the password.
            v-radio-group(v-model='level_input' row label="What to backup:")
                v-radio(label="Everything" value='all' color='accent')
                v-radio(label="Everything except images/files" value='database' color='accent')
            v-text-field(v-model='password_input' label='Encryption Password'
                    type='password' placeholder='(optional)')

    v-card-actions
        span(v-if='connected && !password_input' class='text-body-2 opacity-secondary')
            | Backup will be private but unencrypted (readable by Google)
        app-btn(@click='dismiss' :disabled='loading') Close
        app-btn(v-if='different_db' @click='fresh_backup' color='error' :disabled='loading')
            | Overwrite Existing Backup
        app-btn(v-else-if='connected' @click='fresh_backup' :disabled='loading') Apply Changes
        app-btn(v-else @click='connect' :disabled='loading') Connect

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import {task_manager} from '@/services/tasks/tasks'
import {oauth_pretask_new_usage} from '@/services/tasks/oauth'
import {drive_wipe_all_google, get_backup_dbid} from '@/services/tasks/cloudbackup'
import {AppStoreState} from '@/services/store/types'


@Component({})
export default class extends Vue {

    different_db = false
    password_input = ''
    level_input:'database'|'all' = 'database'  // Default to database if null
    loading = false

    get state(){
        return this.$store.state as AppStoreState
    }

    get connected(){
        return !!this.state.storage_oauth
    }

    get title(){
        if (this.different_db)
            return 'Different Database'
        if (this.connected)
            return 'Change Backup Password'
        return 'Backup to Google Drive'
    }

    async created(){
        // Initialise level from store if already set
        if (this.state.cloudbackup){
            this.level_input = this.state.cloudbackup
        }

        // Check if the existing Drive backup belongs to a different database
        const oauth_id = this.state.storage_oauth
        if (!oauth_id)
            return
        const oauth = await self.app_db.oauths.get(oauth_id)
        if (!oauth)
            return
        const backup_dbid = await get_backup_dbid(oauth)
        this.different_db = !!backup_dbid && backup_dbid !== this.state.dbid
    }

    connect(){
        // Stay open so user can save/sync once OAuth completes and connected becomes true
        void oauth_pretask_new_usage('storage_oauth_setup', [], 'google')
    }

    async fresh_backup(){
        // Wipe existing Drive backup and start fresh
        // Could be for password change, level change, or different_db wipe)
        this.loading = true
        this.$store.commit('dict_set', ['cloudbackup', this.level_input])
        const oauth = await self.app_db.oauths.get(this.state.storage_oauth!)
        if (oauth){
            try {
                await drive_wipe_all_google(oauth)
            } catch (error){
                self.app_report_error(error)
            }
        }
        // NOTE Supplying password arg forces new backup
        void task_manager.start('cloudbackup_sync', [], [this.password_input])
        this.$emit('close')
    }

    dismiss(){
        this.$emit('close')
    }
}

</script>

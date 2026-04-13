
<template lang='pug'>

v-card
    v-card-title Back up to Google Drive

    v-card-text
        template(v-if='different_db')
            | Your Google Drive already contains a backup from a different database.
            |  To continue, the existing backup must be wiped and started fresh.
            |  This cannot be undone.

        template(v-else)
            p(class='text-body-2')
                | Back up to a private area of your Google Drive that only this app can access.
                |  If you add a password, the backup will also be end-to-end encrypted so that
                |  not even Google can read it.
            v-radio-group(v-model='level_input' row label="What to back up:")
                v-radio(:label='`Everything (${size_estimates.all})`'
                    value='all' color='accent')
                v-radio(:label='`Everything except images/files (${size_estimates.database})`'
                    value='database' color='accent')
            app-text(v-model='password_input' label='Encryption password (optional)'
                type='password'
                hint="Keep this safe — the backup cannot be recovered if you forget it.")

    v-card-actions
        app-btn(@click='dismiss') Cancel
        app-btn(v-if='different_db' @click='start_fresh' color='error')
            | Overwrite Existing Backup
        app-btn(v-else @click='enable') Enable Backup

</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'

import {task_manager} from '@/services/tasks/tasks'
import {oauth_pretask_new_usage} from '@/services/tasks/oauth'
import {cloudbackup_size_estimates, get_backup_dbid} from '@/services/tasks/cloudbackup'
import {AppStoreState} from '@/services/store/types'


@Component({})
export default class extends Vue {

    password_input = ''
    level_input:'database'|'all' = 'all'  // Default to all if null
    size_estimates:{database:string, all:string} = {database: '', all: ''}
    different_db = false

    get state(){
        return this.$store.state as AppStoreState
    }

    created(){
        // Fetch size estimates for each backup level
        void cloudbackup_size_estimates().then(sizes => {
            this.size_estimates = sizes
        })
    }

    @Watch('state.storage_oauth')
    async on_connected(oauth_id:string|null){
        // When OAuth finishes, check for a leftover backup and proceed automatically
        if (!oauth_id)
            return
        const oauth = await self.app_db.oauths.get(oauth_id)
        if (!oauth)
            return
        try {
            const backup_dbid = await get_backup_dbid(oauth)
            if (backup_dbid && backup_dbid !== this.state.dbid){
                // Leftover backup from a different database — require confirmation to wipe
                this.different_db = true
                return
            }
        } catch (error){
            // Advisory check failed — proceed with sync anyway
            console.warn("get_backup_dbid check failed:", error)
        }
        this.start_sync()
    }

    enable(){
        // If already connected (e.g. re-enabling after disable), proceed directly
        if (this.state.storage_oauth){
            void this.on_connected(this.state.storage_oauth)
            return
        }
        // Start OAuth; the watcher will proceed with sync once storage_oauth is set
        void oauth_pretask_new_usage('storage_oauth_setup', [], 'google')
    }

    start_fresh(){
        // User confirmed they want to overwrite the leftover backup
        this.different_db = false
        this.start_sync()
    }

    start_sync(){
        // Commit the chosen level and kick off the initial sync, passing password as fresh option
        this.$store.commit('dict_set', ['cloudbackup', this.level_input])
        void task_manager.start('cloudbackup_sync', [], [this.password_input])
        this.$emit('close')
    }

    dismiss(){
        this.$emit('close')
    }
}

</script>

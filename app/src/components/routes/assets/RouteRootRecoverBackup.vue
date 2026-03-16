
<template lang='pug'>

v-card(v-if='$store.state.tmp.restore_backup' class='pa-4 text-center')
    v-card-title(class='justify-center') Recover data from backup
    v-card-text
        | It looks like Stello's data may have become corrupted.
        |  This can happen if Stello's files are moved while it's open, if the harddrive gets full,
        |  or if an error occurs. A backup of your data is available.
        |  Would you like to recover your contacts, messages, and other data from this backup?
    v-card-actions(class='justify-center')
        app-btn(@click='dismiss') Dismiss
        app-btn(@click='recover' color='accent' raised) Recover data

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import {import_database} from '@/services/backup/database'


@Component({})
export default class extends Vue {

    dismiss(){
        const dbid = this.$store.state.tmp.restore_backup as string
        const dismissed = [...(this.$store.state.dismissed_dbids as string[]), dbid]
        this.$store.commit('dict_set', ['dismissed_dbids', dismissed])
        this.$store.commit('tmp_set', ['restore_backup', null])
    }

    async recover(){
        const dbid = this.$store.state.tmp.restore_backup as string
        try {
            const json = await self.app_native.user_file_read(`Backups [${dbid}]/database.json`)
            const {added, skipped} = await import_database(json)
            this.dismiss()
            void this.$store.dispatch('show_snackbar',
                `Recovered ${added} records (${skipped} already existed)`)
        } catch (error){
            self.app_report_error(error)
            void this.$store.dispatch('show_snackbar', "Failed to recover backup")
        }
    }

}

</script>


<style lang='sass' scoped>

</style>

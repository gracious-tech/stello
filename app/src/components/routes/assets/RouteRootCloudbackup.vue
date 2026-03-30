
<template lang='pug'>

v-card(v-if='show' class='pa-4 text-center')
    v-card-title(class='justify-center') Back up your data
    v-card-text
        | For security reasons, Stello accounts cannot be recovered if you lose your computer.
        |  You'd also lose all your messages and contacts.
        |  If you don't already do regular backups of your computer, you may want to
        |  enable encrypted backups to a Google Drive account instead.
    v-card-actions(class='justify-center')
        app-btn(@click='dismiss') I don't need this
        app-btn(@click='open_dialog' color='accent' raised) Backup to Google Drive

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import DialogCloudbackupSetup from '@/components/dialogs/specific/DialogCloudbackupSetup.vue'


@Component({})
export default class extends Vue {

    get show(){
        return this.$store.state.usage_sends >= 2
            && !this.$store.state.storage_oauth
            && this.$store.state.show_cloudbackup_suggest
    }

    dismiss(){
        this.$store.commit('dict_set', ['show_cloudbackup_suggest', false])
    }

    open_dialog(){
        void this.$store.dispatch('show_dialog', {component: DialogCloudbackupSetup})
    }

}

</script>

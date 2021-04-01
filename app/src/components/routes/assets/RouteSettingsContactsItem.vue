
<template lang='pug'>

v-list-item
    v-list-item-content
        v-list-item-title {{ oauth.display }}
        v-list-item-subtitle Last synced: {{ last_synced }}
    v-list-item-action
        app-menu-more
            app-list-item(@click='sync') Sync now
            app-list-item(@click='remove' class='error--text') Remove

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DialogGenericConfirm from '@/components/dialogs/generic/DialogGenericConfirm.vue'
import {OAuth} from '@/services/database/oauths'
import {oauth_revoke_if_obsolete} from '@/services/tasks/oauth'


@Component({})
export default class extends Vue {

    @Prop() oauth:OAuth

    get last_synced():string{
        return this.oauth.contacts_sync_last?.toLocaleString() || "None yet"
    }

    async remove(){
        // Ask for confirmation, then disable syncing, remove all contacts/groups, and try revoke
        const confirmed = await this.$store.dispatch('show_dialog', {
            component: DialogGenericConfirm,
            props: {
                title: "This will disable syncing and remove all related contacts from Stello",
                confirm: "Remove contacts",
                confirm_danger: true,
            },
        })
        if (confirmed){
            // Remove all related contacts and groups
            await Promise.all([
                self._db.contacts.list_for_account(this.oauth.issuer, this.oauth.issuer_id)
                    .then(contacts => Promise.all(
                        contacts.map(c => self._db.contacts.remove(c.id))
                    )),
                self._db.groups.list_for_account(this.oauth.issuer, this.oauth.issuer_id)
                    .then(groups => Promise.all(
                        groups.map(g => self._db.groups.remove(g.id))
                    )),
            ])
            // Now safe to disable the oauth and revoke if needed
            this.oauth.contacts_sync = false
            await self._db.oauths.set(this.oauth)
            oauth_revoke_if_obsolete(this.oauth)
            this.$emit('removed', this.oauth.id)
        }
    }

    sync(){
        // Do a new sync now
        this.$tm.start_contacts_sync(this.oauth.id)
    }

}

</script>


<style lang='sass' scoped>


</style>
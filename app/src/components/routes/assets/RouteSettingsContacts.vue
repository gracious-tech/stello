
<template lang='pug'>

div(class='my-6')
    h1(class='text-h6') Contact Syncing
    p(class='body-2 text--secondary') Accounts that support ongoing syncing of contacts

    v-list
        route-settings-contacts-item(v-for='oauth of oauths' :key='oauth.id' :oauth='oauth'
            @removed='removed')

    p(class='text-center')
        app-btn(@click='import_contacts') Import Contacts

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import DialogContactsImport from '@/components/dialogs/DialogContactsImport.vue'
import RouteSettingsContactsItem from '@/components/routes/assets/RouteSettingsContactsItem.vue'
import {sort} from '@/services/utils/arrays'
import {OAuth} from '@/services/database/oauths'


@Component({
    components: {RouteSettingsContactsItem},
})
export default class extends Vue {

    oauths:OAuth[] = []

    async created():Promise<void>{
        // Get all oauths with contact syncing enabled
        const oauths = (await self._db.oauths.list()).filter(oauth => oauth.contacts_sync)
        sort(oauths, 'display')
        this.oauths = oauths
    }

    removed(oauth_id:string):void{
        // Handle oauth removal events
        this.oauths = this.oauths.filter(oauth => oauth.id !== oauth_id)
    }

    async import_contacts(){
        // Show dialog for importing contacts
        const group_id = await this.$store.dispatch('show_dialog', {
            component: DialogContactsImport,
        })
        if (group_id){
            // Navigate to contacts and display the new group for the import
            this.$router.push({path: '/contacts/', query: {group: group_id}})
        }
    }

}

</script>


<style lang='sass' scoped>


</style>

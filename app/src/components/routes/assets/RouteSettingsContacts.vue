
<template lang='pug'>

div(class='my-6')
    h1(class='text-h6') Contact Syncing
    p(class='body-2 text--secondary') Accounts that support ongoing syncing of contacts

    v-list
        route-settings-contacts-item(v-for='oauth of oauths' :key='oauth.id' :oauth='oauth'
            @removed='removed')

    app-select(v-if='oauths.length' v-model='default_contacts' :items='contacts_options' select
        label="Create new contacts in" class='mt-4')

    p(class='text-center')
        app-btn(@click='import_contacts') Import Contacts

</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'

import DialogContactsImport from '@/components/dialogs/DialogContactsImport.vue'
import RouteSettingsContactsItem from '@/components/routes/assets/RouteSettingsContactsItem.vue'
import {remove_match, sort} from '@/services/utils/arrays'
import {OAuth} from '@/services/database/oauths'
import {Task} from '@/services/tasks/tasks'


@Component({
    components: {RouteSettingsContactsItem},
})
export default class extends Vue {

    oauths:OAuth[] = []

    created(){
        void this.load_oauths()
    }

    get contacts_options(){
        return [
            {value: null, text: "Stello"},
            ...this.oauths.map(oauth => ({value: oauth.service_account, text: oauth.display})),
        ]
    }

    get default_contacts(){
        return this.$store.state.default_contacts
    }
    set default_contacts(value){
        this.$store.commit('dict_set', ['default_contacts', value])
    }

    async load_oauths():Promise<void>{
        // Get all oauths with contact syncing enabled
        const oauths = (await self.app_db.oauths.list()).filter(oauth => oauth.contacts_sync)
        sort(oauths, 'display')
        this.oauths = oauths
    }

    removed(oauth_id:string):void{
        // Handle oauth removal events
        remove_match(this.oauths, oauth => oauth.id === oauth_id)
    }

    async import_contacts(){
        // Show dialog for importing contacts
        const group_id = await this.$store.dispatch('show_dialog', {
            component: DialogContactsImport,
        }) as string
        if (group_id){
            // Navigate to contacts and display the new group for the import
            void this.$router.push({path: '/contacts/', query: {group: group_id}})
        }
    }

    @Watch('$tm.data.finished') watch_finished(task:Task){
        // Respond to finished tasks
        if (task.name === 'contacts_sync'){
            void this.load_oauths()
        }
    }
}

</script>


<style lang='sass' scoped>


</style>

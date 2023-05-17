
<template lang='pug'>

v-list-item
    v-list-item-content
        v-list-item-title {{ request.name }}
        v-list-item-subtitle #[strong {{ request.address }}]
        v-list-item-subtitle {{ request.message }}
    v-list-item-action(class='flex-row align-center')
        app-btn(@click='accept' :disabled='progress' icon='done')
        app-menu-more
            app-list-item(@click='remove' :disabled='progress' class='error--text') Delete

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {RecordRequestSubscribe} from '@/services/database/types'
import {taskless_contacts_create} from '@/services/tasks/contacts'
import {task_manager} from '@/services/tasks/tasks'
import {OAuth} from '@/services/database/oauths'


@Component({})
export default class extends Vue {

    @Prop({required: true, type: Object}) declare readonly request:RecordRequestSubscribe

    progress = false

    async remove(){
        await self.app_db._conn.delete('request_subscribe', this.request.id)
        this.$emit('removed', this.request)
    }

    async accept(){
        this.progress = true
        try {
            await this._accept_inner()
        } catch (error){
            self.app_report_error(error)
        }
        this.progress = false
    }

    async _accept_inner(){

        // If contact with given address already exists, may want to use it
        let contact = (await self.app_db.contacts.list_for_address(this.request.address))[0]

        if (!contact && this.request.service_account){
            // Create a new contact in the service account
            const oauth =
                await self.app_db.oauths.get_by_service_account(this.request.service_account)
            if (oauth){
                contact = await taskless_contacts_create(oauth, this.request.name,
                    this.request.address)
            }
        }

        if (!contact){
            // Add contact as plain Stello contact since doesn't exist and no valid service account
            contact = await self.app_db.contacts.create(
                {name: this.request.name, address: this.request.address})
        }

        // Remove unsubscribe record, if any
        await self.app_db.unsubscribes.remove(this.request.profile, contact.id)

        // Consider request resolved now since contact already created
        await this.remove()

        // Try add contact to groups, if any
        for (const group_id of this.request.groups){

            // Confirm the group still exists
            const group = await self.app_db.groups.get(group_id)
            if (!group){
                continue
            }

            // Method depends on group type
            if (group.service_account){
                // Can only add to group if contact is in same service account
                if (group.service_account === contact.service_account){
                    void task_manager.start_contacts_group_fill(group.id, [contact.id])
                }
            } else {
                // Add to group if contact hasn't been added yet (i.e. contact already existed)
                if (!group.contacts.includes(contact.id)){
                    group.contacts.push(contact.id)
                    await self.app_db.groups.set(group)
                }
            }
        }
    }

}

</script>


<style lang='sass' scoped>

.v-list-item__subtitle
    // Don't hide message contents, wrap instead
    white-space: break-spaces

</style>

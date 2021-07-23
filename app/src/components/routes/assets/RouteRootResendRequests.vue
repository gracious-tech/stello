
<template lang='pug'>

v-card(v-if='requests.length')
    v-card-title Requests to resend an expired message
    v-list
        v-list-item(v-for='request of requests' :key='request.id')
            v-list-item-content
                v-list-item-title {{ request.contact_name }}
                v-list-item-subtitle #[strong {{ request.msg_title }}]
                v-list-item-subtitle {{ request.reason }}
            v-list-item-action(class='flex-row align-center')
                app-btn(v-if='request.msg_exists' @click='request.accept') Resend
                app-btn(@click='request.discard' icon='delete' color='error')

</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'

import {Task} from '@/services/tasks/tasks'
import {Draft} from '@/services/database/drafts'
import {remove_match} from '@/services/utils/arrays'


interface RequestUI {
    id:string
    contact_name:string
    msg_title:string
    reason:string
    msg_exists:boolean
    discard:()=>Promise<void>
    accept:()=>Promise<void>
}


@Component({})
export default class extends Vue {

    requests:RequestUI[] = []

    created(){
        this.load()
    }

    async load(){
        // Load requests and generate UI objects
        const requests:RequestUI[] = []
        for (const record of await self._db._conn.getAll('request_resend')){

            // Get the contact and message
            const contact = await self._db.contacts.get(record.contact)
            const message = await self._db.messages.get(record.message)

            // Helper for removing this record
            const ui_obj_id = record.contact + record.message
            const remove_request = async () => {
                await self._db._conn.delete('request_resend', [record.contact, record.message])
                remove_match(requests, item => item.id === ui_obj_id)
            }

            // Add item to requests array
            requests.push({
                id: ui_obj_id,
                contact_name: contact?.name ?? "[contact deleted]",
                msg_title: message?.draft.title ?? "[message deleted]",
                reason: record.reason,
                msg_exists: !!message,
                discard: async () => {await remove_request()},
                accept: async () => {
                    // Create new draft, with contact as recipient (if contact still exists)
                    const to_be_copied = new Draft(message.draft)
                    to_be_copied.recipients.include_contacts = contact ? [contact.id] : []
                    to_be_copied.recipients.include_groups = []
                    to_be_copied.recipients.exclude_contacts = []
                    to_be_copied.recipients.exclude_groups = []
                    const new_draft = await self._db.draft_copy(to_be_copied)

                    // Delete request
                    await remove_request()

                    // Go to the new draft
                    this.$router.push({name: 'draft', params: {draft_id: new_draft.id}})
                },
            })
        }
        this.requests = requests  // Don't replace until ready
    }

    @Watch('$tm.data.finished') watch_finished(task:Task){
        // Respond to task completions
        if (task.name === 'responses_receive'){
            // May have received a new request
            this.load()
        }
    }

}

</script>


<style lang='sass' scoped>

.v-list-item__subtitle
    // Don't hide message contents, wrap instead
    white-space: break-spaces

</style>

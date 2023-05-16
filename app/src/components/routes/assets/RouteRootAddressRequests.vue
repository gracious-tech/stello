
<template lang='pug'>

v-card(v-if='requests.length')
    v-card-title Requests to change address
    v-list
        v-list-item(v-for='request of requests' :key='request.id')
            v-list-item-content
                v-list-item-title {{ request.name }}
                v-list-item-subtitle {{ request.old }} → #[strong {{ request.new_ }}]
            v-list-item-action(class='flex-row')
                app-btn(@click='request.fn(true)' icon='done')
                app-btn(@click='request.fn(false)' icon='delete' color='error')

</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'

import {Task} from '@/services/tasks/tasks'
import {remove_match} from '@/services/utils/arrays'


interface RequestUI {
    id:string
    name:string
    old:string
    new_:string
    fn:(accept:boolean)=>Promise<void>
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
        for (const record of await self.app_db._conn.getAll('request_address')){

            // Get the contact
            const contact = await self.app_db.contacts.get(record.contact)

            // If contact no longer exists, or has changed address already, discard request
            if (!contact || contact.address !== record.old_address){
                await self.app_db._conn.delete('request_address', record.contact)
                continue
            }

            // Add item to requests array
            requests.push({
                id: contact.id,
                name: contact.name,
                old: contact.address,
                new_: record.new_address,
                fn: async accept => {
                    if (accept){
                        contact.address = record.new_address
                        await self.app_db.contacts.set(contact)
                    }
                    await self.app_db._conn.delete('request_address', record.contact)
                    remove_match(requests, item => item.id === contact.id)
                },
            })
        }
        this.requests = requests  // Don't replace until ready
    }

    @Watch('$tm.data.succeeded') watch_finished(task:Task){
        // Respond to task completions
        if (task.name === 'responses_receive'){
            // May have received a new address change response
            this.load()
        }
    }

}

</script>


<style lang='sass' scoped>

.v-list-item__subtitle
    // Never hide what new address will be, wrap instead
    white-space: break-spaces

</style>


<template lang='pug'>

div
    v-toolbar
        v-toolbar-title Sent Messages

    app-content-list(:items='messages' height='80' class='pt-6')
        template(#default='{item, height_styles}')
            route-messages-item(:msg='item' :recipients='recipients[item.id]' :key='item.id'
                :style='height_styles' @remove='remove')

</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'

import RouteMessagesItem from '@/components/routes/assets/RouteMessagesItem.vue'
import {remove_match, sort} from '@/services/utils/arrays'
import {Message} from '@/services/database/messages'
import {Task} from '@/services/tasks/tasks'


@Component({
    components: {RouteMessagesItem},
})
export default class extends Vue {

    messages:Message[] = []
    recipients:Record<string, string> = {}

    async created(){
        // Get messages from db
        const messages = await self.app_db.messages.list()
        const descriptor = self.app_db.draft_recipients_descriptor()
        for (const msg of messages){
            Vue.set(this.recipients, msg.id, '')
            descriptor(msg.draft).then(desc => {
                Vue.set(this.recipients, msg.id, desc)
            })
        }
        sort(messages, 'published', false)
        this.messages = messages
    }

    remove(id:string){
        // Remove message from messages array (not from db)
        remove_match(this.messages, msg => msg.id === id)
    }

    @Watch('$tm.data.finished') watch_finished(task:Task){
        // Respond to finished tasks
        if (task.name === 'retract_message' && task.options[0]){  // remove option
            // Message has been deleted
            this.remove(task.params[0])
        }
    }
}

</script>


<style lang='sass' scoped>

</style>


<template lang='pug'>

div
    v-toolbar
        v-toolbar-title Sent Messages

    app-content-list(:items='messages' height='80' class='pt-6')
        template(#default='{item, height_styles}')
            route-messages-item(:msg='item' :recipients='recipients[item.id]' :key='item.id'
                :style='height_styles')

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import RouteMessagesItem from '@/components/routes/assets/RouteMessagesItem.vue'
import {sort} from '@/services/utils/arrays'
import {Message} from '@/services/database/messages'


@Component({
    components: {RouteMessagesItem},
})
export default class extends Vue {

    messages:Message[] = []
    recipients:Record<string, string> = {}

    async created(){
        // Get messages from db
        const messages = await self._db.messages.list()
        const descriptor = self._db.draft_recipients_descriptor()
        for (const msg of messages){
            Vue.set(this.recipients, msg.id, '')
            descriptor(msg.draft).then(desc => {
                Vue.set(this.recipients, msg.id, desc)
            })
        }
        sort(messages, 'published', false)
        this.messages = messages
    }
}

</script>


<style lang='sass' scoped>

</style>

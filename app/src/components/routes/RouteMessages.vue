
<template lang='pug'>

div
    v-toolbar
        v-toolbar-title Sent Messages

    app-content(class='pa-5')
        v-list
            route-messages-item(v-for='message of messages' :msg='message' :key='message.id')

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

    async created(){
        // Get messages from db
        const messages = await self._db.messages.list()
        sort(messages, 'published', false)
        this.messages = messages
    }
}

</script>


<style lang='sass' scoped>

</style>

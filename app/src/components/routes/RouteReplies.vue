
<template lang='pug'>

div
    v-toolbar
        v-toolbar-title Responses
        v-spacer
        app-btn(@click='download' icon='cloud_download')

    app-content(class='pa-5')
        route-replies-item(v-for='item of replactions' :replaction='item.replaction'
            :reactions='item.reactions' :key='item.replaction.id' @removed='load')

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import RouteRepliesItem from './assets/RouteRepliesItem.vue'
import {sort} from '@/services/utils/arrays'
import {Reply} from '@/services/database/replies'
import {Reaction} from '@/services/database/reactions'


@Component({
    components: {RouteRepliesItem},
})
export default class extends Vue {

    replies:Reply[] = []
    reactions:Reaction[] = []

    created(){
        this.load()
    }

    async load(){
        // Get items from db
        const replies = await self._db.replies.list()
        sort(replies, 'sent', false)
        this.replies = replies
        const reactions = await self._db.reactions.list()
        sort(reactions, 'sent', false)
        this.reactions = reactions
    }

    get replies_ui(){
        // Replies structured for use in UI
        return this.replies.map(reply => {
            return {
                sent: reply.sent,  // So can sort
                replaction: reply,
            }
        })
    }

    get reactions_ui(){
        // Group reactions by section for use in UI
        const section_order = []
        const section_data:{[sid:string]:Reaction[]} = {}
        for (const reaction of this.reactions){
            // If a new section, create objects for it
            if (!section_order.includes(reaction.section_id)){
                section_order.push(reaction.section_id)
                section_data[reaction.section_id] = []
            }
            section_data[reaction.section_id].push(reaction)
        }
        return section_order.map(sid => {
            return {
                sent: section_data[sid][0].sent,  // So can sort
                replaction: section_data[sid][0],  // Use latest reaction to get most attributes
                reactions: section_data[sid],  // Also provide all reactions
            }
        })
    }

    get replactions(){
        // Get reply/reaction items for UI display
        const items = [...this.replies_ui, ...this.reactions_ui]
        sort(items, 'sent', false)
        return items
    }

    async download(){
        // Manually trigger a download of responses
        this.$tm.start_responses_receive()
    }
}

</script>


<style lang='sass' scoped>

</style>

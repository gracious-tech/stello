
<template lang='pug'>

v-list-item(:to='to')
    v-list-item-content
        v-list-item-title {{ msg.display }}
        v-list-item-subtitle {{ recipients }}
    v-list-item-content
        v-list-item-subtitle(class='text-right') {{ msg.published.toLocaleString() }}
        div(v-if='expires' class='text-right')
            v-chip(small) {{ expires }}
    v-list-item-action
        app-menu-more
            app-list-item(@click='copy') Copy to new draft

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Draft} from '@/services/database/drafts'
import {Message} from '@/services/database/messages'


@Component({})
export default class extends Vue {

    @Prop() msg:Message
    @Prop() recipients:string

    get to(){
        return {name: 'message', params: {msg_id: this.msg.id}}
    }

    get expires():string{
        // A useful description of the msg's expiry time
        if (this.msg.expired){
            return "Expired"
        } else if (this.msg.expires){
            return `Expires in ${this.msg.safe_lifespan_remaining} days`
        }
        return null
    }

    async copy(){
        const copy = await self._db.draft_copy(new Draft(this.msg.draft), false)
        this.$router.push({name: 'draft', params: {draft_id: copy.id}})
    }

}

</script>


<style lang='sass' scoped>


.v-list-item

    ::v-deep .menu-more-btn
        visibility: hidden

    &:hover ::v-deep .menu-more-btn
        visibility: visible


</style>

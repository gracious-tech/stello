
<template lang='pug'>

v-list-item(:to='to')
    v-list-item-content
        v-list-item-title {{ msg.display }}
        v-list-item-subtitle {{ msg.published.toLocaleString() }}
    v-list-item-action
        app-menu-more
            v-list-item(@click='copy')
                v-list-item-content
                    v-list-item-title Copy to new draft

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Draft} from '@/services/database/drafts'
import {Message} from '@/services/database/messages'


@Component({})
export default class extends Vue {

    @Prop() msg:Message

    get to(){
        return {name: 'message', params: {msg_id: this.msg.id}}
    }

    async copy(){
        const copy = await self._db.draft_copy(new Draft(this.msg.draft))
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

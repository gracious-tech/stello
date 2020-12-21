
<template lang='pug'>

div
    v-toolbar(color='primary' dark)
        app-btn(icon='arrow_back' to='../')
        v-toolbar-title Drafts
        v-spacer
        app-btn.new(@click='new_draft' icon='add' fab)

    app-content(class='pa-5')

        h3(class='text-h6') Drafts
        v-list
            route-drafts-item(v-for='draft of regular_drafts' :key='draft.id' :draft='draft'
                @removed='removed' @copied='copied')

        h3(class='text-h6') Templates
        v-list
            route-drafts-item(v-for='draft of templates' :key='draft.id' :draft='draft'
                @removed='removed' @copied='copied')

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import RouteDraftsItem from './assets/RouteDraftsItem.vue'
import {sort} from '@/services/utils/arrays'
import {Draft} from '@/services/database/drafts'


@Component({
    components: {RouteDraftsItem},
})
export default class extends Vue {

    drafts:Draft[] = []

    created(){
        this.load_drafts()
    }

    get regular_drafts(){
        return this.drafts.filter(draft => !draft.template)
    }

    get templates(){
        return this.drafts.filter(draft => draft.template)
    }

    async load_drafts(){
        const drafts = await self._db.drafts.list()
        sort(drafts, 'modified', false)
        this.drafts = drafts
    }

    async new_draft(){
        // Create a new draft and navigate to it
        const draft = await self._db.drafts.create()
        this.$router.push({name: 'draft', params: {draft_id: draft.id}})
    }

    removed(removed_id){
        // Handle removal of a draft
        this.drafts = this.drafts.filter(draft => draft.id !== removed_id)
    }

    copied(copy){
        // Handle copy of a draft
        this.drafts.push(copy)
    }

}

</script>


<style lang='sass' scoped>


.new
    margin-top: 56px

</style>

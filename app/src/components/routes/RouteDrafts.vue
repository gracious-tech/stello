
<template lang='pug'>

div
    v-toolbar
        v-toolbar-title Drafts

    app-content(class='px-5 py-10')

        v-list
            v-subheader Drafts
            route-drafts-item(v-for='draft of regular_drafts' :key='draft.id' :draft='draft'
                @removed='removed' @copied='copied')
            p(v-if='!regular_drafts.length' class='text-center text--secondary text-body-2')
                | No drafts
            div(class='text-center mt-3')
                app-btn(@click='new_regular_draft') New draft

            v-divider(class='my-10')

            v-subheader Templates
            route-drafts-item(v-for='draft of templates' :key='draft.id' :draft='draft'
                @removed='removed' @copied='copied')
            p(v-if='!templates.length' class='text-center text--secondary text-body-2')
                | Create a template so you can copy it when creating new messages
            div(class='text-center mt-3')
                app-btn(@click='new_template' small) New template

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import RouteDraftsItem from './assets/RouteDraftsItem.vue'
import {remove_match, sort} from '@/services/utils/arrays'
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
        const drafts = await self.app_db.drafts.list()
        sort(drafts, 'modified', false)
        this.drafts = drafts
    }

    async new_draft(template:boolean){
        // Create a new draft and navigate to it
        const draft = await self.app_db.drafts.create(template)
        this.$router.push({name: 'draft', params: {draft_id: draft.id}})
    }

    new_regular_draft(event){
        // Create a regular draft
        this.new_draft(false)
    }

    new_template(event){
        // Create a new template
        this.new_draft(true)
    }

    removed(removed_id:string){
        // Handle removal of a draft
        remove_match(this.drafts, draft => draft.id === removed_id)
    }

    copied(copy){
        // Handle copy of a draft
        this.drafts.unshift(copy)
    }

}

</script>


<style lang='sass' scoped>


.new
    margin-top: 56px

.v-subheader
    font-size: 20px

</style>

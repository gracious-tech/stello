
<template lang='pug'>

div.sidebar

    div(class='release-banner') ALPHA

    app-logo.logo

    app-btn.new(@click='new_draft')
        | {{ default_template_exists ? "new from template" : "new message" }}

    v-list(dark).main-nav
        app-list-item(to='/') Dashboard
        v-divider
        app-list-item(to='/drafts/') Drafts
        app-list-item(to='/messages/') Sent
        app-list-item(to='/replies/') Responses
        v-divider
        app-list-item(to='/contacts/') Contacts

    v-list(dark)
        v-divider
        app-list-item(to='/settings/') Settings
        app-list-item(to='/about/') About


</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import AppLogo from '@/branding/AppLogo.vue'


@Component({
    components: {AppLogo},
})
export default class extends Vue {

    default_template_exists = false

    async created(){
        // Confirm whether default template exists
        const default_id = this.$store.state.default_template
        if (default_id && await self._db.drafts.get(default_id)){
            this.default_template_exists = true
        }
    }

    async new_draft(){
        // Create a new draft and navigate to it
        let draft
        if (this.default_template_exists){
            draft = await self._db.draft_copy(this.$store.state.default_template)
        } else {
            draft = await self._db.drafts.create()
        }
        this.$router.push({name: 'draft', params: {draft_id: draft.id}})
    }

}

</script>


<style lang='sass' scoped>

.sidebar
    display: flex
    flex-direction: column
    background-color: $primary
    color: $on_primary
    padding: 24px
    z-index: 10
    overflow-y: auto
    min-width: $stello_sidebar_width

.new
    margin-top: 24px
    margin-bottom: 36px

.main-nav
    flex-grow: 1

</style>

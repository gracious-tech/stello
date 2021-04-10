
<template lang='pug'>

div.sidebar

    div(class='release-banner') BETA

    app-logo.logo

    app-btn.new(@click='new_draft')
        | {{ default_template ? "new from template" : "new message" }}

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
import {Draft} from '@/services/database/drafts'


@Component({
    components: {AppLogo},
})
export default class extends Vue {

    get default_template(){
        return this.$store.state.default_template
    }

    async new_draft(){
        // Create a new draft and navigate to it
        let draft:Draft
        // NOTE Also double check default template id not just set, but actual template exists still
        if (this.default_template && await self._db.drafts.get(this.default_template)){
            draft = await self._db.draft_copy(this.default_template, false)
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
    padding: 24px 12px
    z-index: 10
    overflow-y: auto
    min-width: $stello_sidebar_width

.logo
    flex-shrink: 0  // Don't shrink when sidebar has to scroll

.new
    margin-top: 24px
    margin-bottom: 36px

.main-nav
    flex-grow: 1

.release-banner
    // Appear fixed in top left
    position: absolute
    pointer-events: none
    left: 0
    top: 0
    z-index: 10
    // Size and rotation
    width: 100px
    transform: rotateZ(-45deg) translate(-30px, -14px)
    font-size: 11px
    padding-top: 2px
    text-align: center
    // Style
    color: $on_accent
    background-color: $accent
    font-weight: bold
    letter-spacing: 1px

</style>

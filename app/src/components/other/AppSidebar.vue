
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
        app-list-item(to='/replies/')
            v-badge(:value='unread' :content='unread_replies || ""' color='error' inline)
                | Responses
        v-divider
        app-list-item(to='/contacts/') Contacts

    v-list(dark)
        v-divider
        app-list-item(to='/settings/') Settings
        app-list-item(to='/about/') About


</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'

import AppLogo from '@/branding/AppLogo.vue'
import {Draft} from '@/services/database/drafts'
import {Task} from '@/services/tasks/tasks'


@Component({
    components: {AppLogo},
})
export default class extends Vue {

    async created(){
        this.load_unread()
    }

    get default_template(){
        return this.$store.state.default_template
    }

    get unread_replies(){
        return this.$store.state.tmp.unread_replies
    }

    get unread_reactions(){
        return this.$store.state.tmp.unread_reactions
    }

    get unread():boolean{
        // Whether there are any unread replies or reactions
        return this.unread_replies > 0 || this.unread_reactions > 0
    }

    @Watch('$tm.data.finished') watch_finished(task:Task){
        // Respond to finished tasks
        if (task.name === 'responses_receive'){
            this.load_unread()
        }
    }

    async new_draft(event:MouseEvent){
        // Create a new draft and navigate to it

        // If shift click in dev, trigger hidden action for generating dummy data
        if (process.env.NODE_ENV === 'development' && event.shiftKey){
            // @ts-ignore adding booleans works for this
            const multiplier = event.shiftKey + event.altKey + event.ctrlKey
            this.$store.dispatch('show_snackbar', `Generating dummy data * ${multiplier}...`)
            await self._db.generate_dummy_data(multiplier)
            self.location.reload()
            return
        }

        let draft:Draft
        // NOTE Also double check default template id not just set, but actual template exists still
        if (this.default_template && await self._db.drafts.get(this.default_template)){
            draft = await self._db.draft_copy(this.default_template, false)
        } else {
            draft = await self._db.drafts.create()
        }
        this.$router.push({name: 'draft', params: {draft_id: draft.id}})
    }

    async load_unread():Promise<void>{
        // Update unread counts of responses
        // TODO Indexing `read` and using `count` much quicker, but booleans not indexable
        const num_replies = (await self._db.replies.list()).filter(i => !i.read).length
        const num_reactions = (await self._db.reactions.list()).filter(i => !i.read).length
        this.$store.commit('tmp_set', ['unread_replies', num_replies])
        this.$store.commit('tmp_set', ['unread_reactions', num_reactions])
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

.v-badge
    margin-top: 0

</style>

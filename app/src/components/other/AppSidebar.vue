
<template lang='pug'>

nav.sidebar(class='app-bg-primary')

    //- div(class='release-banner') BETA

    app-logo.logo

    div(class='text-center')
        app-btn.new(@click='new_draft' outlined small color='' dark
                :data-tip='default_template ? "Uses default template" : null')
            | new message

    //- NOTE Lists use dark theme as accent color variant easier to read (and bg is same for both)
    v-list(dark).main-nav
        app-list-item(to='/') Dashboard
        v-divider
        app-list-item(to='/drafts/') Drafts
        app-list-item(to='/messages/') Sent
        app-list-item(to='/replies/')
            v-badge(:value='unread' :content='unread_replies_count || ""' color='error' inline)
                | Responses
        v-divider
        app-list-item(to='/contacts/') Contacts

    v-list(dark)
        v-divider
        app-list-item(to='/settings/') Settings
        app-list-item(href='https://stello.news/guide/') Guide
        app-list-item(to='/about/') About


</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'

import AppLogo from '@/branding/AppLogo.vue'
import {Draft} from '@/services/database/drafts'
import {Task} from '@/services/tasks/tasks'
import {sleep} from '@/services/utils/async'


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

    get unread_replies_count(){
        return Object.keys(this.$store.state.tmp.unread_replies).length
    }

    get unread_reactions_count(){
        return Object.keys(this.$store.state.tmp.unread_reactions).length
    }

    get unread():boolean{
        // Whether there are any unread replies or reactions
        return this.unread_replies_count > 0 || this.unread_reactions_count > 0
    }

    @Watch('$tm.data.succeeded') watch_finished(task:Task){
        // Respond to finished tasks
        if (task.name === 'responses_receive'){
            // Wait a moment before loading as if current route is replies, it will set reads in db
            // If don't wait then this load may have old data and stuck suggesting have new replies
            sleep(1000).then(() => this.load_unread())
        }
    }

    async new_draft(event:MouseEvent){
        // Create a new draft and navigate to it

        // If shift click in dev, trigger hidden action for generating dummy data
        if (import.meta.env.MODE === 'development' && event.shiftKey){
            const multiplier = (event.shiftKey?1:0) + (event.altKey?1:0) + (event.ctrlKey?1:0)
            this.$store.dispatch('show_snackbar', `Generating dummy data * ${multiplier}...`)
            await self.app_db.generate_example_data(multiplier)
            self.location.reload()
            return
        }

        let draft:Draft
        // NOTE Also double check default template id not just set, but actual template exists still
        if (this.default_template && await self.app_db.drafts.get(this.default_template)){
            draft = await self.app_db.draft_copy(this.default_template, false)
        } else {
            draft = await self.app_db.drafts.create()
        }
        this.$router.push({name: 'draft', params: {draft_id: draft.id}})
    }

    async load_unread():Promise<void>{
        // Update unread responses tracking
        // TODO Indexing `read` and using `count` much quicker, but booleans not indexable
        for (const reply of await self.app_db.replies.list()){
            if (!reply.read){
                Vue.set(this.$store.state.tmp.unread_replies, reply.id, true)
            }
        }
        for (const reaction of await self.app_db.reactions.list()){
            if (!reaction.read){
                Vue.set(this.$store.state.tmp.unread_reactions, reaction.id, true)
            }
        }
    }

}

</script>


<style lang='sass' scoped>

@import 'src/styles/utils.sass'


.sidebar
    display: flex
    flex-direction: column
    padding: 24px 12px
    z-index: 10
    overflow-y: auto
    min-width: $stello_sidebar_width
    max-width: $stello_sidebar_width

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
    color: var(--on_accent)
    background-color: var(--accent)
    font-weight: bold
    letter-spacing: 1px

.v-badge
    margin-top: 0

.v-list-item:not(.v-list-item--active)
    // Prevent all links from being accented on light theme
    color: white !important

</style>

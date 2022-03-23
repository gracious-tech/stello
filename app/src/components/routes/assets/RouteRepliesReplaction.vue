
<template lang='pug'>

div.root
    hr
    div.meta(class='d-flex align-center')

        a.author(@click='to_contact' class='font-weight-medium') {{ replaction.contact_name }}

        SharedSvgAnimated.reaction(v-if='!is_reply' :url='reaction_url' :playing='unread')

        div.sent(:title='sent_formal' class='flex'
            :class='unread ? "app-fg-accent-relative" : "text--secondary"') {{ sent_informal }}

        div.actions
            app-btn(@click='reply_by_stello' icon='reply'
                :color='replaction.replied ? "accent" : ""')
            app-menu-more
                app-list-item(@click='toggle_archived')
                    | {{ replaction.archived ? "Unarchive" : "Archive" }}
                app-list-item(@click='remove' class='error--text') Delete

    div.content(v-if='is_reply' class='text-body-1 text--primary') {{ replaction.content }}

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DialogReply from '@/components/dialogs/specific/DialogReply.vue'
import SharedSvgAnimated from '@/shared/SharedSvgAnimated.vue'
import {Reply} from '@/services/database/replies'
import {Reaction} from '@/services/database/reactions'
import {time_between} from '@/services/misc'


@Component({
    components: {SharedSvgAnimated},
})
export default class extends Vue {

    @Prop() declare readonly replaction:Reply|Reaction

    unread = false  // Preservation of initial value before marking as read during `created`

    async created(){
        if (!this.replaction.read){
            // Preserve value for display purposes
            this.unread = true
            // Update actual object
            this.replaction.read = true
            // Update in db and store (for sidebar)
            if (this.replaction.is_reply){
                void self.app_db.replies.set(this.replaction)
                Vue.delete(this.$store.state.tmp.unread_replies, this.replaction.id)
            } else {
                void self.app_db.reactions.set(this.replaction)
                Vue.delete(this.$store.state.tmp.unread_reactions, this.replaction.id)
            }
        }
    }

    get is_reply():boolean{
        // Whether replaction is a reply or a reaction
        return this.replaction.is_reply
    }

    get reaction_url():string|null{
        // Return url for reaction (if any)
        if (this.is_reply)
            return null
        const ext = this.replaction.content === 'pray' ? 'svg' : 'json'
        return `reactions/${this.replaction.content}.${ext}`
    }

    get sent_informal(){
        // A string representing the sent date, worded as "... ago"
        return time_between(this.replaction.sent)
    }

    get sent_formal(){
        // A string representing the sent date, worded as the exact date/time
        return this.replaction.sent.toLocaleString()
    }

    to_contact(){
        // Navigate to the contact that sent this response
        void this.$router.push({name: 'contact', params: {contact_id: this.replaction.contact_id}})
    }

    toggle_archived(){
        // Toggle whether this response is archived
        this.replaction.archived = !this.replaction.archived
        void self.app_db[this.replaction.is_reply ? 'replies' : 'reactions'].set(this.replaction)
    }

    reply_by_stello(){
        // Open reply dialog
        void this.$store.dispatch('show_dialog', {
            component: DialogReply,
            props: {
                replaction: this.replaction,
            },
        })
    }

    remove():void{
        // Remove the replaction
        void self.app_db[this.replaction.is_reply ? 'replies' : 'reactions']
            .remove(this.replaction.id)
        this.$emit('removed', this.replaction.id)
    }

}

</script>


<style lang='sass' scoped>

.root

    &:first-child hr
        display: none  // Don't show the hr if this is the first response of a section

.reaction
    width: 48px
    height: 48px
    margin-left: 12px

.sent
    text-align: right
    font-size: 12px
    padding: 0 12px

.content
    white-space: pre-wrap

</style>

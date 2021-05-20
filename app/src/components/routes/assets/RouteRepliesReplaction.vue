
<template lang='pug'>

div.root
    hr
    div.meta(class='d-flex align-center')

        a.author(@click='to_contact' class='font-weight-medium') {{ replaction.contact_name }}

        SharedSvgAnimated.reaction(v-if='!is_reply' :url='reaction_url' :playing='unread')

        div.sent(:title='sent_formal' class='flex'
            :class='unread ? "app-fg-accent-relative" : "text--secondary"') {{ sent_informal }}

        div.actions
            app-btn(@click='reply_by_stello' icon='reply' :color='replaction.replied ? "accent" : ""')
            app-menu-more
                app-list-item(@click='reply_by_email') Reply via email
                app-list-item(@click='toggle_archived')
                    | {{ replaction.archived ? "Unarchive" : "Archive" }}
                app-list-item(@click='remove' color='error') Delete

    div.content(v-if='is_reply' class='text-body-1 text--primary') {{ replaction.content }}

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import SharedSvgAnimated from '@/shared/SharedSvgAnimated.vue'
import {Reply} from '@/services/database/replies'
import {Reaction} from '@/services/database/reactions'
import {mailto} from '@/services/utils/misc'
import {escape_for_html} from '@/services/utils/strings'
import {format_date_exact, format_date_relative} from '@/services/misc'


@Component({
    components: {SharedSvgAnimated},
})
export default class extends Vue {

    @Prop() replaction:Reply|Reaction

    unread = false  // Preservation of initial value before marking as read during `created`

    async created(){
        if (!this.replaction.read){
            // Preserve value for display purposes
            this.unread = true
            // Update actual object
            this.replaction.read = true
            // Update in db and store (for sidebar)
            if (this.replaction.is_reply){
                self._db.replies.set(this.replaction)
                Vue.delete(this.$store.state.tmp.unread_replies, this.replaction.id)
            } else {
                self._db.reactions.set(this.replaction)
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
        return format_date_relative(this.replaction.sent)
    }

    get sent_formal(){
        // A string representing the sent date, worded as the exact date/time
        return format_date_exact(this.replaction.sent)
    }

    to_contact(){
        // Navigate to the contact that sent this response
        this.$router.push({name: 'contact', params: {contact_id: this.replaction.contact_id}})
    }

    toggle_archived(){
        // Toggle whether this response is archived
        this.replaction.archived = !this.replaction.archived
        self._db[this.replaction.is_reply ? 'replies' : 'reactions'].set(this.replaction)
    }

    async reply_by_stello(){
        // Create a new draft as a reply to this response

        // Create a new draft
        const draft = await self._db.drafts.create_object()
        draft.reply_to = this.replaction.id
        draft.title = `Re: ${this.replaction.msg_title}`
        draft.recipients.include_contacts.push(this.replaction.contact_id)

        // Need to get the original message to know the profile used
        const msg = await self._db.messages.get(this.replaction.msg_id)
        draft.profile = msg?.draft.profile ?? this.$store.state.default_profile

        // Create a new section with the response quoted
        const quote = escape_for_html(this.replaction.content)
        const section = await self._db.sections.create({
            type: 'text',
            html: `<p>&nbsp;</p><p>&nbsp;</p><blockquote>${quote}</blockquote>`,
            standout: null,
        })
        draft.sections.push([section.id])

        // Save the draft and navigate to it
        await self._db.drafts.set(draft)
        this.$router.push({name: 'draft', params: {draft_id: draft.id}})
    }

    async reply_by_email(){
        // Trigger a new email reply in the user's default mail client
        const contact = await self._db.contacts.get(this.replaction.contact_id)
        const address = contact?.address
        const subject = `Re: ${this.replaction.msg_title}`
        const body = `\n\n\n> ${this.replaction.content.replaceAll('\n', '\n> ')}`
        self.location.assign(mailto(address, subject, body))
    }

    remove(){
        // Remove the replaction
        self._db[this.replaction.is_reply ? 'replies' : 'reactions'].remove(this.replaction.id)
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

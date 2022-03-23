
<template lang='pug'>

v-card

    v-card-title Reply to {{ replaction.contact_name }}

    v-card-text
        app-html.html(v-model='html' class='pa-4')

    v-card-actions
        app-btn(@click='edit_further') More options
        v-spacer
        app-btn(@click='$emit("close")') Cancel
        app-btn(@click='send') Send

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Reply} from '@/services/database/replies'
import {Reaction} from '@/services/database/reactions'
import {escape_for_html} from '@/services/utils/strings'


@Component({})
export default class extends Vue {

    @Prop({type: Object, required: true}) declare readonly replaction:Reply|Reaction

    html = ''

    created(){
        // Init html with quote
        const quote = escape_for_html(this.replaction.content)
        this.html = `<p></p><p></p><blockquote>${quote}</blockquote>`
    }

    async create_reply_draft(){
        // Create a new draft as a reply to this response

        // Create a new draft
        const draft = await self.app_db.drafts.create_object()
        draft.reply_to = this.replaction.id
        draft.title = this.replaction.msg_title
        if (!draft.title.startsWith('Re: ')){
            draft.title = 'Re: ' + draft.title
        }
        draft.recipients.include_contacts.push(this.replaction.contact_id)

        // Need to get the original message to know the profile used
        // WARN Don't fallback to default profile as later logic needs to know original profile gone
        const msg = await self.app_db.messages.get(this.replaction.msg_id)
        draft.profile = msg?.draft.profile ?? null

        // Create a new section
        const section = await self.app_db.sections.create_object({
            type: 'text',
            html: this.html,
            standout: null,
        })
        await self.app_db.sections.set(section)
        draft.sections.push([section.id])

        // Save the draft and return it
        await self.app_db.drafts.set(draft)
        return draft
    }

    go_to_draft(id:string){
        // Navigate to the draft with given id
        void this.$router.push({name: 'draft', params: {draft_id: id}})
    }

    async edit_further(){
        // Create the draft and navigate to it
        const draft = await this.create_reply_draft()
        this.go_to_draft(draft.id)
    }

    async send(){
        // Create and send
        const draft = await this.create_reply_draft()

        // Since not going to RouteDraft have to ensure profile & contact still exist manually
        if (! await self.app_db.contacts.get(this.replaction.contact_id)){
            void this.$store.dispatch('show_snackbar', "Contact no longer exists")
            this.go_to_draft(draft.id)
        } else if (!draft.profile){
            // Original message gone so don't know which profile was used
            // Too complicated to explain to user, so just go to RouteDraft
            this.go_to_draft(draft.id)
        } else if (! await self.app_db.profiles.get(draft.profile)){
            void this.$store.dispatch('show_snackbar', "Sending account no longer exists")
            this.go_to_draft(draft.id)
        } else {
            // No issues so can send straight away
            const msg = await self.app_db.draft_to_message(draft.id)
            void this.$tm.start_send_message(msg.id)
        }

        // Will either send or go to draft, so always close dialog
        this.$emit('close')
    }
}

</script>


<style lang='sass' scoped>

.html
    background-color: hsl(0, 0%, 50%, 0.1)

</style>

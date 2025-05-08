
<template lang='pug'>

v-list-item(:to='to')
    div(v-if='msg.draft.reply_to' class='mr-3')
        app-svg(name='icon_reply')
    v-list-item-content
        v-list-item-title {{ msg.display }}
        v-list-item-subtitle {{ recipients }}
    div.right(class='text-right')
        div(:title='published_exact' class='text--secondary')
            | {{ published_relative }}
        div.expires(v-if='expires_relative' :title='expires_exact' class='mt-1')
            | {{ expires_relative }}
    v-list-item-action(class='flex-row align-center')
        app-btn.view(@click.prevent='view_own_copy' icon='visibility' data-tip="View online")
        app-menu-more
            app-list-item(@click='copy') Copy to new draft
            app-list-item(@click='export_html') Export as webpage
            app-list-item(@click='export_pdf') Export as PDF
            app-list-item(@click='retract' :disabled='msg.expired' class='error--text')
                | {{ retract_label }}
            app-list-item(@click='remove' class='error--text') Delete

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DialogGenericConfirm from '@/components/dialogs/generic/DialogGenericConfirm.vue'
import {Draft} from '@/services/database/drafts'
import {Message} from '@/services/database/messages'
import {time_between} from '@/services/misc'
import {gen_view_url} from '@/services/misc/invites'
import {save_draft} from '@/services/backup/drafts'


@Component({})
export default class extends Vue {

    @Prop({required: true}) declare readonly msg:Message
    @Prop({default: ''}) declare readonly recipients:string

    get to(){
        return {name: 'message', params: {msg_id: this.msg.id}}
    }

    get published_relative(){
        // Get human fiendly published date string relative to now
        return time_between(this.msg.published)
    }

    get published_exact(){
        // Get human fiendly exact published date string
        return this.msg.published.toLocaleString()
    }

    get retract_label():string{
        // Get most appropriate text for retract button label
        // NOTE Want to show "Retract" when already expired for disabled state
        if (this.msg.expired || !this.msg.probably_expired){
            return "Retract"
        }
        return "Retract (confirm expired)"
    }

    get expires_relative():string|null{
        // A useful description of the msg's expiry time
        if (this.msg.probably_expired){
            return "Expired"
        } else if (this.msg.expires){
            return `Expires ${time_between(this.msg.expires)}`
        }
        return null
    }

    get expires_exact():string{
        // Get human fiendly exact expires date string
        if (!this.msg.probably_expired && this.msg.expires){
            return this.msg.expires.toLocaleDateString()
        }
        return ''
    }

    async view_own_copy(){
        // Open the copy that was sent to self
        const own_copy = (await self.app_db.copies.list_for_msg(this.msg.id))
            .find(c => c.contact_id === 'self')
        const profile = await self.app_db.profiles.get(this.msg.draft.profile)
        if (own_copy && profile && !this.msg.probably_expired){
            const url = await gen_view_url(own_copy, profile)
            self.open(url, '_blank')
        } else {
            const confirmed = await this.$store.dispatch('show_dialog', {
                component: DialogGenericConfirm,
                props: {
                    title: "Cannot view online",
                    text: `This message has either expired or was not sent to yourself when published. Would you like to copy it to a new draft to see it in the editor instead?`,
                    confirm: "Copy to new draft",
                },
            }) as true|undefined
            if (confirmed){
                void this.copy()
            }
        }
    }

    async copy(){
        const copy = await self.app_db.draft_copy(new Draft(this.msg.draft), false)
        void this.$router.push({name: 'draft', params: {draft_id: copy.id}})
    }

    async can_access_profile():Promise<boolean>{
        // Return whether can access profile (and therefore retract/delete message)
        return !! await self.app_db.profiles.get(this.msg.draft.profile)
    }

    async retract(){
        // Remove a message from server

        // Can't retract if can't access profile
        if (! await this.can_access_profile()){
            void this.$store.dispatch('show_snackbar',
                "Cannot retract message as no longer have access to the sending account")
            return
        }

        // If not expired yet, confirm with user before continuing
        if (!this.msg.probably_expired){
            const confirmed = await this.$store.dispatch('show_dialog', {
                component: DialogGenericConfirm,
                props: {
                    title: "All your recipients will lose access to this message",
                    confirm: "Retract",
                    confirm_danger: true,
                },
            }) as true|undefined
            if (!confirmed){
                return
            }
        }

        // Retract the message
        const task = await this.$tm.start('retract_message', [this.msg.id], [false])
        const error = await task.done
        if (!error){
            this.msg.expired = true  // Reflect change already made to msg in db
        }
    }

    export_html(){
        void save_draft('html', this.msg.draft, null, this.msg.published)
    }

    export_pdf(){
        void save_draft('pdf', this.msg.draft, null, this.msg.published)
    }

    async remove(){
        // Remove a message from server and Stello

        // If can't access profile then will just be deleting object in db
        const can_access_profile = await this.can_access_profile()

        // Confirm with user before continuing
        const confirmed = await this.$store.dispatch('show_dialog', {
            component: DialogGenericConfirm,
            props: {
                title: can_access_profile
                    ? "Message will be deleted for both you and your recipients"
                    : "Message will be deleted for you, but not your recipients",
                text: can_access_profile ? "" : `
                    You no longer have access to the account used to send the message,
                    so it cannot be confirmed whether your recipients still have access or not.`,
                confirm: "Delete",
                confirm_danger: true,
            },
        }) as true|undefined
        if (!confirmed){
            return
        }

        // Either retract+delete or just delete
        if (can_access_profile){
            // NOTE Parent component responsible for detecting task completion
            void this.$tm.start('retract_message', [this.msg.id], [true])
        } else {
            void self.app_db.messages.remove(this.msg.id)
            this.$emit('remove', this.msg.id)
        }
    }

}

</script>


<style lang='sass' scoped>


.v-list-item

    ::v-deep .menu-more-btn, .view
        opacity: 0.1

    &:hover
        ::v-deep .menu-more-btn, .view
            opacity: 1

    .right
        font-size: 12px

        .expires
            display: inline-block
            background-color: rgba(#888888, 0.5)
            border-radius: 12px
            padding: 4px 8px


</style>

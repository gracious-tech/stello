
<template lang='pug'>

div
    v-toolbar
        app-btn(to='../' icon='arrow_back')
        v-toolbar-title {{ message && message.draft.title }}

    app-content(v-if='!message' class='text-center pt-10')
        h1(class='text--secondary text-h6') Message does not exist

    app-content(v-else class='pa-5 pt-8')

        p #[strong Sent:] {{ published }}
        p #[strong Expires:] {{ expires }}
        p #[strong Read by:] {{ num_copies_read }} of {{ copies.length }} recipients

        v-alert(v-if='num_failures' color='primary')
            p Your message may not have been sent to everyone if your email service limits how often you can send emails. You can try to click "FINISH SENDING" and with each attempt see if more messages have been sent. In some cases you may need to wait 24 hours before your email service allows more messages to be sent. Stello will not send duplicate emails to those who have already received them, so there is no harm in repeated attempts.

        p(v-if='num_failures' class='error--text')
            | {{ num_failures }} messages were not sent
            app-btn(@click='send_all' small) Finish sending

        v-data-table(:items='copies_ui' :headers='copies_ui_headers')

            template(v-slot:item.contact_link='{item}')
                router-link(:to='item.to') {{ item.display }}

            template(v-slot:item.sent='{item}')
                app-svg(:name='`icon_${item.sent_icon}`' :class='item.sent_class')

            template(v-slot:item.actions='{item}')
                app-menu-more
                    app-list-item(@click='item.copy_invite') Copy notification
                    app-list-item(@click='item.retract' :disabled='item.expired' color='error') Retract

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {sort} from '@/services/utils/arrays'
import {Message} from '@/services/database/messages'
import {MessageCopy} from '@/services/database/copies'
import {get_text_invite_for_copy} from '@/services/misc/invites'
import {Read} from '@/services/database/reads'
import {Profile} from '@/services/database/profiles'


@Component({})
export default class extends Vue {

    @Prop() msg_id:string

    message:Message = null
    copies:MessageCopy[] = []
    reads:Read[] = []
    profile:Profile = null

    copies_ui_headers = [
        {value: 'contact_link', text: "Recipient"},
        {value: 'sent', text: "Sent"},
        {value: 'reads', text: "Reads"},
        {value: 'actions', text: ""},
    ]

    created(){
        // Get message and copies from db
        this.load()
    }

    get published(){
        // Get human fiendly published date string
        return this.message.published.toLocaleString()
    }

    get expires():string{
        // Human friendly string for indicating expiry
        if (this.message.probably_expired){
            return "already expired"
        }
        return this.message.expires ? this.message.expires.toLocaleDateString() : "never"
    }

    get copies_ui(){
        // Get UI view of copies for use in table
        return this.copies.map(copy => {
            return {
                display: copy.display,
                to: {name: 'contact', params: {contact_id: copy.contact_id}},
                copy_invite: async () => {
                    const text = await get_text_invite_for_copy(copy)
                    self.navigator.clipboard.writeText(text)
                    this.$store.dispatch('show_snackbar', "Invite copied")
                },
                expired: copy.expired,
                retract: async () => {
                    await this.profile.new_host_user().delete_file(`copies/${copy.id}`)
                    copy.expired = true
                    self._db.copies.set(copy)
                },
                sent_icon: copy.sent === null ? 'help' : (copy.sent ? 'check_circle' : 'cancel'),
                sent_class: copy.sent === null ? '' : (copy.sent ? 'accent--text' : 'error--text'),
                reads: this.reads.filter(r => r.copy_id === copy.id).length,
            }
        })
    }

    get all_sent(){
        // Whether all copies have been sent (to the extent that can be automated)
        return this.copies.every(copy => copy.sent !== false)
    }

    get num_copies_read(){
        // Return how many copies have at least one read recorded
        return new Set(this.reads.map(read => read.copy_id)).size
    }

    get num_failures(){
        // Return how many copies failed to be uploaded and/or emailed
        return this.copies.filter(copy => copy.sent === false).length
    }

    async load(){
        // Load the message and copies data
        this.message = await self._db.messages.get(this.msg_id)
        if (!this.message)
            return
        const copies = await self._db.copies.list_for_msg(this.msg_id)
        sort(copies, 'display')
        this.copies = copies
        this.profile = await self._db.profiles.get(this.message.draft.profile)
        this.reads = await self._db.reads.list_for_msg(this.msg_id)
    }

    async send_all(){
        // Ensure all copies have been uploaded, and all emails sent
        this.$tm.start_send_message(this.msg_id)
    }
}

</script>


<style lang='sass' scoped>


::v-deep .v-data-table
    margin: 48px 0

    td:last-child
        text-align: right !important

        .v-btn
            visibility: hidden

    td:last-child:hover
        .v-btn
            visibility: visible


</style>

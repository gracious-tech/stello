
<template lang='pug'>

div
    v-toolbar
        app-btn(to='../' icon='arrow_back')
        v-toolbar-title {{ message ? message.draft.title : "Message" }}

    app-content(v-if='message' class='pa-5 pt-8')

        p #[strong Sent:] {{ published }}
        p #[strong Read by:] {{ num_copies_read }} of {{ copies.length }} recipients

        v-data-table(:items='copies_ui' :headers='copies_ui_headers' :items-per-page='15')

            template(v-slot:item.contact_link='{item}')
                router-link(:to='item.to') {{ item.display }}

            template(v-slot:item.sent='{item}')
                app-svg(:name='`icon_${item.sent_icon}`' :class='item.sent_class')

            template(v-slot:item.actions='{item}')
                app-menu-more
                    app-list-item(@click='item.copy_invite') Copy notification

        p(v-if='email_failures' class='error--text')
            | {{ email_failures }} emails could not be delivered
        p
            app-btn(@click='send_all' :disabled='all_sent')
                | {{ all_sent ? "Send successful" : "Finish sending" }}

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {sort} from '@/services/utils/arrays'
import {Message} from '@/services/database/messages'
import {MessageCopy} from '@/services/database/copies'
import {Sender, get_text_invite_for_copy} from '@/services/sending'
import {Task} from '@/services/tasks'
import {Read} from '@/services/database/reads'


@Component({})
export default class extends Vue {

    @Prop() msg_id

    message:Message = null
    copies:MessageCopy[] = []
    reads:Read[] = []

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

    get email_failures(){
        // Return how many emails failed to be delivered
        return this.copies.filter(copy => copy.sent === false).length
    }

    async load(){
        // Load the message and copies data
        this.message = await self._db.messages.get(this.msg_id)
        const copies = await self._db.copies.list_for_msg(this.msg_id)
        sort(copies, 'display')
        this.copies = copies
        this.reads = await self._db.reads.list_for_msg(this.msg_id)
    }

    async send_all(){
        // Ensure all copies have been uploaded, and all emails sent
        await this.$store.dispatch('send_message', this.msg_id)
        this.load()
    }
}

</script>


<style lang='sass' scoped>


.v-data-table
    margin: 48px 0


</style>

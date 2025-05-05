
<template lang='pug'>

div
    v-toolbar
        app-btn(to='../' icon='arrow_back')
        v-toolbar-title {{ message && message.draft.title }}
        v-spacer
        app-btn(v-if='message' @click='view_own_copy' icon='visibility'
            :disabled='!own_copy || !profile || message.probably_expired'
            data-tip="View online" data-tip-below)
        app-menu-more(v-if='message')
            app-list-item(@click='open_resend_dialog' :disabled='!!sending_task') Resend some emails
            app-list-item(@click='copy_to_draft') Copy to new draft
            app-list-item(@click='export_html') Export as webpage
            app-list-item(@click='export_pdf') Export as PDF

    app-content(v-if='!message' class='text-center pt-10')
        h1(class='text--secondary text-h6') Message does not exist

    template(v-else)

        div.meta(class='app-bg-primary-relative')
            div.inner(class='pa-3')

                div(class='d-flex justify-space-around mb-3')
                    div(:title='published_exact') #[strong Sent:] {{ published_relative }}
                    div(:title='expires_exact || ""') #[strong Expires:] {{ expires_relative }}

                div(class='text-center')
                    strong
                        | {{ num_copies_read }} of {{ copies.length }} opened
                        | ({{ percent_copies_read }}%)

                div(v-if='!profile' class='text-center error--text mt-3')
                    | The account used to send this no longer exists

                div(v-else-if='sending_task' class='text-center accent--text mt-3')
                    | Sending
                    v-progress-circular(indeterminate width='2' size='20' color='accent'
                        class='ml-6 mr-3')
                    app-btn(@click='() => {sending_task && sending_task.abort()}'
                            :disabled='!!sending_task.aborted' color='error' small)
                        | {{ sending_task.aborted ? "Stopping" : "Stop" }}

                div(v-else-if='num_still_pending || num_invalid' class='text-center mt-3')
                    template(v-if='num_still_pending')
                        span(class='error--text') {{ num_still_pending }} messages could not be sent
                        app-btn(href='https://stello.news/guide/sending/' small) Why?
                    span(v-else class='error--text mr-3') Some recipients have invalid addresses
                    | |
                    app-btn(@click='send_all' small) Finish sending

                div(v-else-if='!manual_sending_done' class='text-center mt-3 error--text')
                    | Some contacts have no address and must be sent to manually

        app-content-list(:items='copies_sorted' height='56')
            template(#default='{item, height_styles}')
                RouteMessageCopy(:key='item.id' :copy='item' :reads='reads_by_copy[item.id]'
                    :profile='profile' :style='height_styles'
                    @export_html='export_html' @export_pdf='export_pdf')


</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import DialogResend from '@/components/dialogs/specific/DialogResend.vue'
import RouteMessageCopy from './assets/RouteMessageCopy.vue'
import {remove_match, sort} from '@/services/utils/arrays'
import {Message} from '@/services/database/messages'
import {MessageCopy} from '@/services/database/copies'
import {Draft} from '@/services/database/drafts'
import {Read} from '@/services/database/reads'
import {Profile} from '@/services/database/profiles'
import {Task} from '@/services/tasks/tasks'
import {time_between} from '@/services/misc'
import {gen_view_url} from '@/services/misc/invites'
import {save_draft} from '@/services/backup/drafts'


@Component({
    components: {RouteMessageCopy},
})
export default class extends Vue {

    @Prop({type: String, required: true}) declare readonly msg_id:string

    message:Message|null = null
    copies:MessageCopy[] = []
    reads:Read[] = []
    profile:Profile|null = null
    own_copy:MessageCopy|null = null

    async created(){
        // Get message and copies from db
        this.message = await self.app_db.messages.get(this.msg_id) ?? null
        if (!this.message){
            return
        }
        const copies = await self.app_db.copies.list_for_msg(this.msg_id)

        // Remove own copy (if it exists) from list so doesn't appear in UI or affect stats
        this.own_copy = remove_match(copies, c => c.contact_id === 'self') ?? null

        sort(copies, 'display')
        this.copies = copies

        // Access to profile is required to retract messages
        this.profile = await self.app_db.profiles.get(this.message.draft.profile) ?? null

        // Do initial load of reads
        void this.load_reads()
    }

    // COMPUTED

    get published_relative(){
        // Get human fiendly published date string relative to now
        return time_between(this.message!.published)
    }

    get published_exact(){
        // Get human fiendly exact published date string
        return this.message!.published.toLocaleString()
    }

    get expires_relative():string{
        // The time until message expires
        if (this.message!.probably_expired){
            return "already expired"
        }
        return this.message!.expires ? time_between(this.message!.expires) : "never"
    }

    get expires_exact():string|null{
        // The exact date of expiry
        // NOTE Not specifying the time since expiration isn't exact
        return this.message!.expires && this.message!.expires.toLocaleDateString()
    }

    get reads_by_copy():Record<string, Read[]>{
        // Reads mapped to copy ids
        const map:Record<string, Read[]> = {}
        for (const copy of this.copies){
            Vue.set(map, copy.id, [])
        }
        for (const read of this.reads){
            // WARN Using `?` to avoid possible race condition that seemed to come up
            map[read.copy_id]?.push(read)
        }
        return map
    }

    get num_copies_read(){
        // Return how many copies have at least one read recorded
        return Object.values(this.reads_by_copy).filter(reads => reads.length).length
    }

    get percent_copies_read(){
        // Floored percent of num_copies_read
        return Math.floor(this.num_copies_read / this.copies.length * 100)
    }

    get num_still_pending(){
        // How many copies haven't yet been uploaded or haven't yet been sent (if eligable)
        return this.copies
            .filter(c => c.status === 'pending_upload' || c.status === 'pending_send').length
    }

    get num_invalid(){
        // How many copies couldn't be sent due to invalid addresses
        return this.copies.filter(c => c.status === 'invalid_address').length
    }

    get manual_sending_done(){
        // True if there are no messages left that require manual sending
        return !this.copies.some(c => c.status === 'manual')
    }

    get sending_task():Task|undefined{
        // The task if message is currently being sent
        return this.$tm.data.tasks.find(
            t => t.name === 'send_message' && t.params[0] === this.msg_id)
    }

    get copies_sorted(){
        // A sorted view of the copies that reacts to status changes
        // NOTE Still keeps original sorting by name as secondary sort
        const status_order:MessageCopy['status'][] =
            ['invalid_address', 'manual', 'pending_upload', 'pending_send', 'invited', 'expired']
        const sorted = [...this.copies]
        sorted.sort((a, b) => status_order.indexOf(a.status) - status_order.indexOf(b.status))
        return sorted
    }

    // METHODS

    async load_reads(){
        // Load reads data
        this.reads = await self.app_db.reads.list_for_msg(this.msg_id)
    }

    async send_all(){
        // Ensure all copies have been uploaded, and all emails sent
        void this.$tm.start_send_message(this.msg_id)
    }

    async copy_to_draft(){
        // Create a new draft from this message
        const copy = await self.app_db.draft_copy(new Draft(this.message!.draft), false)
        void this.$router.push({name: 'draft', params: {draft_id: copy.id}})
    }

    open_resend_dialog(){
        // Open dialog for setting invited to null for copies that got bounce messages
        void this.$store.dispatch('show_dialog', {
            component: DialogResend,
            props: {
                // Show only copies that could have bounced (have address and no reads)
                copies: this.copies.filter(copy => copy.invited && copy.contact_address
                    && !this.reads_by_copy[copy.id]?.length),
            },
            wide: true,
        })
    }

    async view_own_copy(){
        // Open the copy that was sent to self
        const url = await gen_view_url(this.own_copy!, this.profile!)
        self.open(url, '_blank')
    }

    export_html(copy?:MessageCopy){
        void save_draft('html', this.message!.draft, this.profile, this.message!.published, copy)
    }

    export_pdf(copy?:MessageCopy){
        void save_draft('pdf', this.message!.draft, this.profile, this.message!.published, copy)
    }

    // WATCHES

    @Watch('$tm.data.succeeded') watch_tm_finished(task:Task){
        // Listen to task completions and adjust state as needed
        if (task.name === 'responses_receive'){
            void this.load_reads()
        }
    }

    @Watch('$store.state.tmp.uploaded') watch_uploaded(updated_copy:MessageCopy){
        // Watch uploaded and update own state if relevant
        const match = this.copies.find(copy => copy.id === updated_copy.id)
        if (match){
            match.uploaded = updated_copy.uploaded
        }
    }

    @Watch('$store.state.tmp.invited') watch_invited(updated_copy:MessageCopy){
        // Watch invited and update own state if relevant
        const match = this.copies.find(copy => copy.id === updated_copy.id)
        if (match){
            match.invited = updated_copy.invited
        }
    }
}

</script>


<style lang='sass' scoped>

@import 'src/styles/utils.sass'


.meta
    .inner
        max-width: $header-width
        margin-left: auto
        margin-right: auto

</style>

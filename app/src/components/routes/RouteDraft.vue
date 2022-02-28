
<template lang='pug'>

div
    v-toolbar
        app-btn(to='../' icon='arrow_back')
        template(v-if='draft')
            input.msg-title(v-model.trim='title' placeholder="Subject...")
            app-btn(v-if='draft.template' @click='copy_to_draft' fab icon='post_add'
                data-tip="Use for new draft" data-tip-instant)
            app-btn(v-else @click='send' :class='{barrier: sending_barrier}' icon='send' fab
                :data-tip='sending_barrier' data-tip-instant)

    div.meta(v-if='draft' class='app-bg-primary-relative')
        div.inner(class='d-flex align-center')

            template(v-if='profile')
                div.profile(@click='show_profile_dialog')
                    div.label From
                    div.value
                        strong {{ profile.display }}
                    div.value {{ sender_name }}
                div.recipients(@click='show_recipients_dialog')
                    div.label To {{ final_recipients.length ? `(${final_recipients.length})` : '' }}
                    div.value
                        strong {{ groups_included_desc }}
                        template(v-if='groups_included_desc && contacts_included_desc') ,&nbsp;
                        | {{ contacts_included_desc }}
                    div.value(class='error--text excluded')
                        strong {{ groups_excluded_desc }}
                        template(v-if='groups_excluded_desc && contacts_excluded_desc') ,&nbsp;
                        | {{ contacts_excluded_desc }}
                div.security(@click='show_security_dialog')
                    div.label Expiry
                    div.value {{ lifespan_desc }}
                    div.value {{ max_reads_desc }}

            div(v-else class='text-center flex')
                app-btn(@click='create_profile') Create account to send

            app-menu-more
                app-list-item(@click='delete_draft' class='error--text')
                    | {{ draft.template ? "Delete template" : "Delete draft" }}

    div.stello-displayer(v-if='draft' :class='{dark: dark_message}')
        draft-invite(v-if='profile' :draft='draft' :profile='profile'
            :suggestions='existing_images')
        shared-dark-toggle(v-model='dark_message')
        draft-content(ref='content' :draft='draft' :sections='draft.sections' :profile='profile'
            @save='save')

    app-content(v-if='!draft' class='text-center pt-10')
        h1(class='text--secondary text-h6') Draft does not exist

</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import DraftContent from './assets/DraftContent.vue'
import DraftInvite from './assets/DraftInvite.vue'
import DialogDraftProfile from '@/components/dialogs/DialogDraftProfile.vue'
import DialogDraftRecipients from '@/components/dialogs/DialogDraftRecipients.vue'
import DialogDraftSecurity from '@/components/dialogs/DialogDraftSecurity.vue'
import SharedDarkToggle from '@/shared/SharedDarkToggle.vue'
import {Draft} from '@/services/database/drafts'
import {Profile} from '@/services/database/profiles'
import {Group} from '@/services/database/groups'
import {Contact} from '@/services/database/contacts'
import {Unsubscribe} from '@/services/database/unsubscribes'
import {sort} from '@/services/utils/arrays'
import {Task} from '@/services/tasks/tasks'
import {get_final_recipients} from '@/services/misc/recipients'
import {lifespan_days_to_text} from '@/services/misc'


@Component({
    components: {DraftContent, SharedDarkToggle, DraftInvite},
})
export default class extends Vue {

    @Prop({type: String, required: true}) declare readonly draft_id:string

    draft:Draft|null = null
    profiles:Profile[] = []
    groups:Group[] = []
    contacts:Contact[] = []
    unsubscribes:Unsubscribe[] = []
    sending = false

    async created(){
        // Load the draft
        this.draft = await self.app_db.drafts.get(this.draft_id) ?? null
        if (!this.draft){
            return
        }

        // Load profiles (so know if need to create or select existing)
        void self.app_db.profiles.list().then(profiles => {
            this.profiles = profiles
            // Auto assign profile if doesn't exist and one is available
            if (!this.profile){
                // First try default
                if (this.$store.state.default_profile){
                    this.draft!.profile = this.$store.state.default_profile
                }
                // If default didn't work, try first in list
                if (!this.profile){
                    const first_profile = this.profiles.filter(p => p.setup_complete)[0]
                    if (first_profile){
                        this.draft!.profile = first_profile.id
                    }
                }
                // Save changes
                void this.save()
            }
        })

        this.load_contacts()
        void this.load_unsubscribes()
    }

    @Watch('draft.profile') watch_profile(){
        // Unsubscribes are specific to profile
        void this.load_unsubscribes()
    }

    @Watch('$tm.data.finished') watch_finished(task:Task){
        // Respond to task completions
        if (task.name.startsWith('contacts_')){
            this.load_contacts()
        } else if (task.name === 'responses_receive'){
            void this.load_unsubscribes()
        }
    }

    get existing_images(){
        // Access to existing images used in content sections
        return (this.$refs['content'] as unknown as {existing_images:Blob[]}).existing_images

    }

    get profile():Profile|undefined{
        // Get profile record for draft (if it exists)
        return this.profiles.find(p => p.id === this.draft!.profile && p.setup_complete)
    }

    get final_recipients(){
        // Return final recipients of message
        return get_final_recipients(this.draft!, this.contacts, this.groups, this.unsubscribes)
    }

    get sending_barrier(){
        // Return explanation of any barrier to sending, else null
        if (this.draft!.template)
            return "This is a template and cannot be sent (copy instead)"
        if (!this.title)
            return "Give message a subject"
        if (!this.draft!.sections.length)
            return "Give message some contents"
        if (!this.profile)
            return "Specify which account to send from"
        if (!this.final_recipients.length)
            return "Add some recipients"
        return null
    }

    get title(){
        // Get draft's title
        return this.draft!.title
    }
    set title(value){
        // Set draft's title
        this.draft!.title = value
        void this.save()
    }

    get dark_message(){
        // Control whether message should be dark themed (for user only)
        return this.$store.state.dark_message
    }
    set dark_message(value){
        this.$store.commit('dict_set', ['dark_message', value])
    }

    get sender_name(){
        // Get sender name, accounting for inheritance
        return this.draft!.options_identity.sender_name
            || this.profile!.msg_options_identity.sender_name
    }

    get contacts_included_desc(){
        // Get list of included contacts as a string
        return this.draft!.recipients.include_contacts
            .map(id => this.contacts.find(c => c.id === id)?.display)
            .filter(i => i)
            .join(', ')
    }

    get contacts_excluded_desc(){
        // Get list of excluded contacts as a string
        return this.draft!.recipients.exclude_contacts
            .map(id => this.contacts.find(c => c.id === id)?.display)
            .filter(i => i)
            .join(', ')
    }

    get groups_included_desc(){
        // Get list of included groups as a string
        if (this.draft!.recipients.include_groups.includes('all')){
            return "All contacts"
        }
        return this.draft!.recipients.include_groups
            .map(id => this.groups.find(c => c.id === id)?.display)
            .filter(i => i)
            .join(', ')
    }

    get groups_excluded_desc(){
        // Get list of excluded groups as a string
        return this.draft!.recipients.exclude_groups
            .map(id => this.groups.find(c => c.id === id)?.display)
            .filter(i => i)
            .join(', ')
    }

    get lifespan_desc():string{
        // Get desc of lifespan, accounting for inheritance
        const lifespan = this.draft!.options_security.lifespan
            ?? this.profile!.msg_options_security.lifespan
        return lifespan_days_to_text(lifespan)
    }

    get max_reads_desc():string{
        // Get desc of max reads, accounting for inheritance
        const max_reads = this.draft!.options_security.max_reads
            ?? this.profile!.msg_options_security.max_reads
        return max_reads === Infinity ? "" : `${max_reads} opens`
    }

    async save(){
        // Save changes to draft
        await self.app_db.drafts.set(this.draft!)
    }

    async create_profile(){
        // Create new profile (or resume setting up an in progress one)
        const profile_in_progress = this.profiles.find(p => !p.setup_complete && !p.old_beta)
        const profile = profile_in_progress ?? await self.app_db.profiles.create()
        void this.$router.push({
            name: 'profile',
            params: {profile_id: profile.id},
        })
    }

    load_contacts(){
        // Load contacts related
        void self.app_db.groups.list().then(groups => {
            sort(groups, 'name')
            this.groups = groups
        })
        void self.app_db.contacts.list().then(contacts => {
            sort(contacts, 'name')
            this.contacts = contacts
        })
    }

    async load_unsubscribes(){
        // Load unsubscribes for profile (if known)
        this.unsubscribes = []  // Clear previous
        if (this.draft!.profile){
            this.unsubscribes = await self.app_db.unsubscribes.list_for_profile(this.draft!.profile)
        }
    }

    show_profile_dialog(){
        // Open dialog for modifying draft's sending profile and related settings
        void this.$store.dispatch('show_dialog', {
            component: DialogDraftProfile,
            props: {draft: this.draft, profiles: this.profiles},
        })
    }

    show_recipients_dialog(){
        // Open dialog for modifying draft's recipients
        void this.$store.dispatch('show_dialog', {
            component: DialogDraftRecipients,
            props: {
                draft: this.draft,
                groups: this.groups,
                contacts: this.contacts,
                unsubscribes: this.unsubscribes,
            },
        })
    }

    show_security_dialog(){
        // Open dialog for modifying draft's security settings
        void this.$store.dispatch('show_dialog', {
            component: DialogDraftSecurity,
            props: {draft: this.draft, profile: this.profile},
        })
    }

    async send(){
        // Send the message

        // Don't allow if a sending barrier
        if (this.sending_barrier){
            return
        }

        // Don't allow if already sending
        // WARN `draft_to_message` may take some ms, so avoid even slight chance of double send
        if (this.sending){
            return
        }
        this.sending = true

        // Convert to message
        const msg = await self.app_db.draft_to_message(this.draft_id)

        // Increase send counter
        this.$store.commit('dict_set', ['usage_sends', this.$store.state.usage_sends as number + 1])

        // Go to sent message now, so user knows things are happening
        void this.$router.push({name: 'message', params: {msg_id: msg.id}})

        // Start sending task
        void this.$tm.start_send_message(msg.id)
    }

    async copy_to_draft(){
        // Copy template to a new draft and navigate to it
        const draft = await self.app_db.draft_copy(this.draft!, false)
        void this.$router.push({name: 'draft', params: {draft_id: draft.id}})
    }

    delete_draft(){
        // Delete this draft
        void self.app_db.drafts.remove(this.draft_id)
        // If this was the default template, clear it
        if (this.draft_id === this.$store.state.default_template){
            this.$store.commit('dict_set', ['default_template', null])
        }
        void this.$router.push('../')
    }

}

</script>


<style lang='sass' scoped>

@import 'src/styles/globals.sass'


.msg-title  // .title used by Vuetify
    padding: 6px
    width: 100%
    font-size: 20px


.v-btn--fab
    &.barrier
        filter: saturate(25%)
    &::after
        // Position tooltip to left of button so doesn't go off page
        top: auto !important
        right: 70px


.meta

    .inner
        max-width: $header-width
        margin-left: auto
        margin-right: auto

    .profile, .recipients, .security
        cursor: pointer
        flex-grow: 1
        padding: 12px
        align-self: stretch
        font-size: 14px

        &:hover
            background-color: rgba(white, 0.3)

        .label
            font-size: 12px
            opacity: 0.6

    .profile
        min-width: 150px
        padding-left: 24px

    .recipients
        .value:not(.excluded)
            @include max_lines(2)
        .value.excluded
            @include max_lines(1)

    .security
        min-width: 100px

    ::v-deep .menu-more-btn
        margin: 8px


.stello-displayer
    width: 100%
    flex-grow: 1
    overflow-y: auto
    position: relative  // So dark toggle button scrolls normally

    // Override app defaults that won't be present in displayer
    ::v-deep

        //- NOTE Both 'div' and ':not(.v-btn' just added to override another competting style
        //-      Can't use !important as would override invite's open message button
        div a:not(.v-btn)
            color: var(--stello-primary-fg)

        strong
            font-weight: revert  // 500 weight not supported by fonts used for message display

        button
            font-family: Roboto, sans-serif
            // Make buttons inherit message theme color rather than app theme color
            color: inherit !important
            &.v-btn--disabled
                color: inherit !important
                opacity: 0.3

</style>

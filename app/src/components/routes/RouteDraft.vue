
<template lang='pug'>

div
    v-toolbar(v-if='!draft')
        app-btn(to='../' icon='arrow_back')
    v-toolbar(v-else)

        app-btn(to='../' icon='arrow_back')

        v-spacer

        app-btn(@click='show_profile_dialog' icon='fingerprint' color='')
            | Sender
        app-btn(@click='show_recipients_dialog' icon='contact_mail' color='' class='recipients')
            | Recipients
        app-menu-more
            app-list-item(@click='show_security_dialog' :disabled='!profile') Security
            app-list-item(@click='delete_draft' color='error')
                | {{ draft.template ? "Delete template" : "Delete draft" }}

        v-spacer

        app-btn(v-if='draft.template' @click='copy_to_draft' fab icon='post_add'
            data-tip="Use for new draft" data-tip-instant)
        app-btn(v-else @click='send' :class='{barrier: sending_barrier}' icon='send' fab
            :data-tip='sending_barrier' data-tip-instant)

        //- Second row of toolbar
        template(#extension)
            div.status(class='app-fg-accent-relative') {{ status }}

    div.msg-title(v-if='draft' class='app-bg-primary-relative')
        //- NOTE Using "Subject" since users already familiar with email subjects not being in body
        input(v-model.trim='title' placeholder="Subject...")

    div.stello-displayer(v-if='draft' :class='{dark: dark_message}')
        shared-dark-toggle(v-model='dark_message')
        draft-content(ref='content' :draft='draft' :profile='profile' :sections='sections')

    app-content(v-if='!draft' class='text-center pt-10')
        h1(class='text--secondary text-h6') Draft does not exist

</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import DraftContent from './assets/DraftContent.vue'
import DialogDraftProfile from '@/components/dialogs/DialogDraftProfile.vue'
import DialogDraftRecipients from '@/components/dialogs/DialogDraftRecipients.vue'
import DialogDraftSecurity from '@/components/dialogs/DialogDraftSecurity.vue'
import SharedDarkToggle from '@/shared/SharedDarkToggle.vue'
import {debounce_set} from '@/services/misc'
import {Draft} from '@/services/database/drafts'
import {Profile} from '@/services/database/profiles'
import {Section} from '@/services/database/sections'


@Component({
    components: {DraftContent, SharedDarkToggle},
})
export default class extends Vue {

    @Prop({type: String, required: true}) draft_id:string

    draft:Draft = null
    sections:{[id:string]: Section} = {}  // Content of sections loaded separately from the draft
    sections_inited = false
    profile:Profile = null
    groups = []

    async created(){
        // Get groups data needed for determining recipients
        self._db.groups.list().then(groups => {
            this.groups = groups
        })

        // Load the draft and the contents of the draft's sections
        const draft = await self._db.drafts.get(this.draft_id)
        if (draft){
            for (const section of await self._db.sections.get_multiple(draft.sections.flat())){
                Vue.set(this.sections, section.id, section)
            }
            this.draft = draft
        }
    }

    @Watch('draft.profile') async watch_profile(){
        // Load profile when it changes
        if (this.draft.profile){
            this.profile = await self._db.profiles.get(this.draft.profile)
        } else {
            this.profile = null
        }
    }

    @Watch('draft.sections') watch_sections(){
        // Fetch section data for any sections that haven't been fetched yet (on init and create)

        // Cache sections_inited so stays same throughout this call
        const cached_sections_inited = this.sections_inited
        this.sections_inited = true

        // Process each section id
        this.draft.sections.flat().forEach(async section_id => {

            // Ignore section if data already obtained as only interested in creation events
            // NOTE Changes to sections are made to section objects directly, not refetched from db
            if (section_id in this.sections){
                return
            }

            // Get the section's data and add to `this.sections`
            const section_data = await self._db.sections.get(section_id)
            Vue.set(this.sections, section_id, section_data)

            // If just created a new section, open modify dialog straight away (unless text)
            // NOTE Have to use same instance of section data, otherwise lose reactivity
            //      Which is why must handle here since its the origin of the section instance
            if (cached_sections_inited && section_data.content.type !== 'text'){
                // @ts-ignore as doesn't know about component's methods
                this.$refs.content.modify_section(section_data)
            }
        })
    }

    get final_recipients(){
        // Return final recipients of message
        return this.draft.get_final_recipients(this.groups)
    }

    get sending_barrier(){
        // Return explanation of any barrier to sending, else null
        if (this.draft.template)
            return "This is a template and cannot be sent (copy instead)"
        if (!this.title)
            return "Give message a subject"
        if (!this.draft.sections.length)
            return "Give message some contents"
        for (const section_id of this.draft.sections.flat()){
            const section = this.sections[section_id]  // WARN May not exist if fetching from db
            if (section && section.content.type === 'images' && !section.content.images.length){
                return "Add an image to the section you created"
            }
            if (section && section.content.type === 'video' && !section.content.format){
                return "Add a video to the section you created"
            }
        }
        if (!this.final_recipients.length)
            return "Add some recipients"
        if (!this.profile)
            return "Specify which account to send from"
        if (!this.profile.host.bucket)
            return "Selected sending account has not been setup yet"
        return null
    }

    get status(){
        // A summary of the message's settings

        // Construct base status
        const account = this.profile ? this.profile.display : "No sending account"
        const recipients = this.final_recipients.length
        let status = `${account}  |  ${recipients} recipients`

        // Optionally add expiry if profile chosen
        if (this.profile){
            const days = this.draft.options_security.lifespan
                ?? this.profile.msg_options_security.lifespan
            const expiry = [null, Infinity].includes(days) ? "no expiry" : `${days} days`
            status += `  |  ${expiry}`
            // Optionally add max_reads if defined
            const reads = this.draft.options_security.max_reads
                ?? this.profile.msg_options_security.max_reads
            if (reads !== Infinity){
                status += ` (${reads} opens)`
            }
        }

        return status
    }

    get title(){
        // Get draft's title
        return this.draft.title
    }
    @debounce_set() set title(value){
        // Set draft's title
        this.draft.title = value
        self._db.drafts.set(this.draft)
    }

    get dark_message(){
        // Control whether message should be dark themed (for user only)
        return this.$store.state.dark_message
    }
    set dark_message(value){
        this.$store.commit('dict_set', ['dark_message', value])
    }

    show_profile_dialog(){
        // Open dialog for modifying draft's sending profile and related settings
        this.$store.dispatch('show_dialog', {
            component: DialogDraftProfile,
            props: {draft: this.draft},
        })
    }

    show_recipients_dialog(){
        // Open dialog for modifying draft's recipients
        this.$store.dispatch('show_dialog', {
            component: DialogDraftRecipients,
            props: {draft: this.draft},
            tall: true,
        })
    }

    show_security_dialog(){
        // Open dialog for modifying draft's security settings
        this.$store.dispatch('show_dialog', {
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

        // Convert to message
        const msg = await self._db.draft_to_message(this.draft_id)

        // Upload configs first if needed
        if (this.profile.configs_need_uploading){
            const error = await (await this.$tm.start_configs_update(this.profile.id)).done
            if (error){
                return  // Failed to upload configs / let user fix via failed tasks UI first
            }
        }

        // Start sending task
        this.$tm.start_send_message(msg.id)

        // Navigate to sent message route
        this.$router.push({name: 'message', params: {msg_id: msg.id}})
    }

    async copy_to_draft(){
        // Copy template to a new draft and navigate to it
        const draft = await self._db.draft_copy(this.draft, false)
        this.$router.push({name: 'draft', params: {draft_id: draft.id}})
    }

    delete_draft(){
        // Delete this draft
        self._db.drafts.remove(this.draft_id)
        // If this was the default template, clear it
        if (this.draft_id === this.$store.state.default_template){
            this.$store.commit('dict_set', ['default_template', null])
        }
        this.$router.push('../')
    }

}

</script>


<style lang='sass' scoped>

.recipients:not(.v-btn--icon)
    // Separate buttons (but not if icons)
    margin: 0 12px


.v-toolbar ::v-deep
    height: auto !important

    .v-btn--fab
        margin-top: 64px  // Height of toolbar

        &.barrier
            filter: saturate(25%)

        &::after
            // Position tooltip to left of button so doesn't go off page
            top: auto
            right: 70px

    .v-toolbar__extension
        height: auto !important
        z-index: -1  // Don't allow status to get in way of button hover

        .status
            font-size: 12px
            text-align: center
            position: absolute
            top: 0
            margin-top: -18px
            user-select: none


.msg-title  // .title used by Vuetify
    padding: 6px

    input
        text-align: center
        width: 100%
        outline-style: none
        font-size: 20px
        margin: 6px


.stello-displayer
    width: 100%
    flex-grow: 1
    overflow-y: auto
    position: relative  // So dark toggle button scrolls normally

    // Override app defaults that won't be present in displayer
    ::v-deep
        strong
            font-weight: revert  // 500 weight not supported by fonts used for message display

    // Make any buttons inherit message theme color rather than app theme color
    ::v-deep button
        color: inherit !important

        &.v-btn--disabled
            color: inherit !important
            opacity: 0.3

</style>

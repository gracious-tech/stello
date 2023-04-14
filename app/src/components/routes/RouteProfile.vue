
<template lang='pug'>

div
    v-toolbar
        app-btn(to='../' icon='arrow_back')
        v-toolbar-title {{ profile ? profile.display : "" }}

    app-content(v-if='!profile' class='text-center pt-10')
        h1(class='text--secondary text-h6') Sending account does not exist
    route-profile-steps(v-else-if='!profile.setup_complete' :profile='profile')
    app-content(v-else class='pa-3')

        h2 Email
        v-card
            v-card-text
                p(class='body-2 text--secondary' v-t='"email.p1"')
                h6.address(class='text-center text-h6 mb-6')
                    span(v-if='profile.smtp_ready') {{ profile.email }}
                    app-btn(@click='show_email_dialog')
                        | {{ profile.smtp_ready ? "Change" : "Connect email account" }}
                app-select(v-bind='$t("send_to_self")' v-model='send_to_self'
                    :items='send_to_self_items' select)


        h2 Responses
        v-card
            v-card-text
                app-switch(v-bind='$t("allow_replies")' v-model='allow_replies')
                app-switch(v-bind='$t("allow_comments")' v-model='allow_comments')
                app-switch(v-bind='$t("allow_reactions")' v-model='allow_reactions')
                div.reactions(:class='{allowed: allow_reactions}')
                    SharedSvgAnimated(v-for='url of reaction_urls' :key='url' :url='url'
                        :playing='false')
                app-switch(v-bind='$t("smtp_no_reply")' v-model='smtp_no_reply'
                    :hint='smtp_no_reply_hint')
                app-select(v-bind='$t("notify_mode")' v-model='notify_mode'
                    :items='notify_mode_items' select)
                app-switch(v-bind='$t("notify_include_contents")' v-model='notify_include_contents'
                    color='error' :disabled='cant_include_contents' :disabled_value='false')


        h2 Message expiry
        v-card
            v-card-text
                app-select(v-bind='$t("msg_lifespan")' v-model='msg_lifespan'
                    :items='lifespan_options')
                app-integer(v-bind='$t("msg_max_reads")' v-model='msg_max_reads'  :min='1' infinity)
                //- app-switch(v-bind='$t("allow_delete")' disabled v-model='allow_delete')
                app-switch(v-bind='$t("allow_resend_requests")' v-model='allow_resend_requests')


        //- h2 Auto-exclude recipients
        //- v-card
        //-     v-card-text
        //-         div(class='body-2 text--secondary')
        //-             p(v-t='"auto_exclude.p1"')
        //-             p(v-t='"auto_exclude.p2"')
        //-             p(v-t='"auto_exclude.p3"')
        //-         app-switch(:value='auto_exclude' @input='toggle_auto_exclude'
        //-             v-bind='$t("auto_exclude_switch")' disabled)
        //-         app-integer(v-model='auto_exclude_threshold'
        //-             v-bind='$t("auto_exclude_threshold")'
        //-             :min='1' :max='100' :disabled='!auto_exclude' style='max-width: 400px')
        //-         app-select(v-model='auto_exclude_exempt_groups' :items='groups_ui' multiple
        //-             v-bind='$t("auto_exclude_exempt_groups")' :disabled='!auto_exclude')


        template(v-if='profile.host && profile.host.cloud === "gracious"')
            h2 Additional security
            v-card
                v-card-text
                    app-switch(v-bind='$t("generic_domain")' v-model='generic_domain')


        h2 Message appearance
        v-card
            v-card-text
                profile-theme(:profile='profile' @save='save')


        //- NOTE Identity section at end since takes up the most room
        h2 Identity
        v-card
            v-card-text
                p(class='body-2 text--secondary' v-t='"identity.p1"')
                route-profile-identity(:profile='profile')


</template>


<script lang='ts'>

const i18n = {
    // Email
    email: {
        p1: `Stello uses your email address to send messages
            and receive notifications about replies.`,
    },
    send_to_self: {
        label: "Send a copy of all messages to self",
        hint: `This allows you to view sent messages the way your recipients see them. An extra message will be uploaded that only you can access.`,
    },
    // Identity
    identity: {
        p1: `How emails and other notifications identify you prior to opening messages.
            Unlike messages, this information does not expire
            and will remain in recipients' inboxes, likely for all eternity.`,
    },
    // Responses
    allow_replies: {
        label: "Allow replies",
        hint: "Include a reply form at the end of each message",
    },
    allow_comments: {
        label: "Allow comments",
        hint: "Allow recipients to comment on message sections",
    },
    allow_reactions: {
        label: "Allow reactions",
        hint: "Allow recipients to react to message sections",
    },
    smtp_no_reply: {
        label: "Warn against replying by email",
    },
    notify_mode: {
        label: "Notification frequency",
        hint: "How often Stello should notify you about responses to your messages",
    },
    notify_include_contents: {
        label: "Include contents of replies in emails",
        hint: `When Stello notifies you of a new reply it will include the actual contents
            of the reply in the email notification.
            This means the contents, while still private, is not end-to-end encrypted.`,
    },
    // Message expiry
    msg_lifespan: {
        label: "Expire after",
        hint: "The default duration until messages expire",
    },
    msg_max_reads: {
        label: "Lose access after opening",
        hint: `The default number of times each recipient can open a message
            before they lose access`,
        suffix: "times",
    },
    allow_delete: {
        label: "Allow deleting before expiry",
        hint: "Allow recipients to delete their own copy of a message before it actually expires",
    },
    allow_resend_requests: {
        label: "Allow resend requests",
        hint: `Allow recipients to request that you resend a message that has expired
            before they could read it. You still must approve any such requests.`,
    },
    // Auto-exclude
    auto_exclude: {
        p1: "Automatically stop sending messages to contacts who aren't reading them.",
        p2: `Some contacts may be too polite to unsubscribe,
            and some may even opt to send your messages to spam instead.
            In which case it is best to stop sending messages to those who aren't reading them.`,
        p3: `If enabled, contacts will be auto-excluded at the time of sending,
            even if they are still members of the group being sent to
            (the same as if they had unsubscribed).
            This will not affect contacts who are added individually as recipients though,
            only when part of a group.`,
    },
    auto_exclude_switch: {
        label: "Enable",
    },
    auto_exclude_threshold: {
        label: "Auto-exclude if haven't read",
        prefix: "any of last",
        suffix: "messages",
    },
    auto_exclude_exempt_groups: {
        label: "Don't apply to contacts in groups",
        hint: `Auto-exclude will never apply to any contacts in these groups
            (e.g. groups for your family or financial supporters)`,
    },
    // Additional security
    generic_domain: {
        label: "Use non-branded links (encrypted.news rather than stello.news)",
        hint: `This makes it less obvious you're using newsletter software linked
            to a Christian organisation`,
    },
}


import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import SharedSvgAnimated from '@/shared/SharedSvgAnimated.vue'
import DialogEmailSettings from '@/components/dialogs/reuseable/DialogEmailSettings.vue'
import RouteProfileIdentity from '@/components/routes/assets/RouteProfileIdentity.vue'
import ProfileTheme from '@/components/reuseable/ProfileTheme.vue'
import RouteProfileSteps from '@/components/routes/assets/RouteProfileSteps.vue'
import {Profile} from '@/services/database/profiles'
import {Task, task_manager} from '@/services/tasks/tasks'
import {generate_lifespan_options} from '@/services/misc'
import {reaction_url} from '@/shared/shared_functions'


@Component({
    components: {RouteProfileIdentity, RouteProfileSteps, ProfileTheme, SharedSvgAnimated},
    i18n: {messages: {en: i18n}},
})
export default class extends Vue {

    @Prop({required: true}) declare readonly profile_id:string

    profile:Profile = null as unknown as Profile  // Avoid having to type profile as optional
    groups_ui:{text:string, value:string}[] = []
    send_to_self_items = [
        {value: 'no', text: "No"},
        {value: 'yes_without_email', text: "Enable viewing"},
        {value: 'yes_without_replies_email',
            text: "Enable viewing + send email (except for replies)"},
        {value: 'yes', text: "Enable viewing + send email"},
    ]
    notify_mode_items = [
        {value: 'none', text: "None"},
        {value: 'first_new_reply', text: "Once until Stello opened"},
        {value: 'replies', text: "Every reply"},
        {value: 'replies_and_reactions', text: "Every reply & reaction"},
    ]

    async created(){
        // Get the profile for the given id, and groups (needed for auto_exclude_exempt_groups)
        const [profile, groups] = await Promise.all([
            self.app_db.profiles.get(this.profile_id),
            self.app_db.groups.list(),
        ])
        this.groups_ui = groups.map(g => {
            return {text: g.display, value: g.id}
        })
        this.profile = profile!
    }

    async destroyed(){
        // Check if configs need uploading when leaving
        if (this.profile?.configs_need_uploading){
            void task_manager.start_configs_update(this.profile.id)
        }
    }

    get is_default(){
        return this.profile.id === this.$store.state.default_profile
    }

    get smtp_no_reply_hint():string{
        return `If someone tries to reply via email, show: "${this.profile.smtp_reply_to_name}"`
    }

    get auto_exclude(){
        // Whether auto exclude is enabled
        return this.profile.options.auto_exclude_threshold !== null
    }

    get cant_include_contents(){
        // When the current notify mode is incompatible with including contents of replies
        return ["none", "first_new_reply"].includes(this.profile.options.notify_mode)
    }

    get lifespan_options(){
        // List of lifespan options for UI to make selection simpler
        return generate_lifespan_options(this.profile.max_lifespan)
    }

    get reaction_urls(){
        // Chosen reactions as a list of urls
        return this.profile.options.reaction_options.map(reaction => reaction_url(reaction))
    }

    // OPTIONS

    get send_to_self(){
        return this.profile.options.send_to_self
    }
    set send_to_self(value){
        this.profile.options.send_to_self = value
        this.save()
    }

    get notify_mode(){
        return this.profile.options.notify_mode
    }
    set notify_mode(value){
        this.profile.options.notify_mode = value
        this.save(true)
    }

    get notify_include_contents(){
        return this.profile.options.notify_include_contents
    }
    set notify_include_contents(value){
        this.profile.options.notify_include_contents = value
        this.save(true)
    }

    get allow_replies(){
        return this.profile.options.allow_replies
    }
    set allow_replies(value){
        this.profile.options.allow_replies = value
        this.save(true)
    }

    get allow_comments(){
        return this.profile.options.allow_comments
    }
    set allow_comments(value){
        this.profile.options.allow_comments = value
        this.save(true)
    }

    get allow_reactions(){
        return this.profile.options.allow_reactions
    }
    set allow_reactions(value){
        this.profile.options.allow_reactions = value
        this.save(true)
    }

    get allow_delete(){
        return this.profile.options.allow_delete
    }
    set allow_delete(value){
        this.profile.options.allow_delete = value
        this.save(true)
    }

    get allow_resend_requests(){
        return this.profile.options.allow_resend_requests
    }
    set allow_resend_requests(value){
        this.profile.options.allow_resend_requests = value
        this.save(true)
    }

    get auto_exclude_threshold(){
        return this.profile.options.auto_exclude_threshold
    }
    set auto_exclude_threshold(value){
        this.profile.options.auto_exclude_threshold = value
        this.save()
    }

    get auto_exclude_exempt_groups(){
        return this.profile.options.auto_exclude_exempt_groups
    }
    set auto_exclude_exempt_groups(value){
        this.profile.options.auto_exclude_exempt_groups = value
        this.save()
    }

    get smtp_no_reply(){
        return this.profile.options.smtp_no_reply
    }
    set smtp_no_reply(value){
        this.profile.options.smtp_no_reply = value
        this.save()
    }

    get generic_domain(){
        return this.profile.options.generic_domain
    }
    set generic_domain(value){
        this.profile.options.generic_domain = value
        this.save(true)
    }

    get msg_lifespan(){
        return this.profile.msg_options_security.lifespan
    }
    set msg_lifespan(value){
        this.profile.msg_options_security.lifespan = value
        this.save()
    }

    get msg_max_reads(){
        return this.profile.msg_options_security.max_reads
    }
    set msg_max_reads(value){
        this.profile.msg_options_security.max_reads = value
        this.save()
    }

    // WATCH

    @Watch('$tm.data.finished') async watch_tm_finished(task:Task):Promise<void>{
        // Listen to task completions and adjust state as needed
        const affect_profile:Record<string, number> = {
            send_oauth_setup: 1,  // Index of profile_id param
            configs_update: 0,
            hosts_storage_update: 0,
        }
        if (task.name in affect_profile
                && task.params[affect_profile[task.name]!] === this.profile.id){
            // Reload profile from db
            this.profile = (await self.app_db.profiles.get(this.profile.id))!
        }
    }

    save(affects_config=false){
        // Save changes to profile
        if (affects_config){
            this.profile.host_state.displayer_config_uploaded = false
            this.profile.host_state.responder_config_uploaded = false
        }
        void self.app_db.profiles.set(this.profile)
    }

    show_email_dialog(){
        // Show dialog for configurable smtp settings
        void this.$store.dispatch('show_dialog', {
            component: DialogEmailSettings,
            props: {
                profile: this.profile,
                // Revert to first step if smtp working, as likely want to change address completely
                force_step: this.profile.smtp_ready ? 'init' : null,
            },
        })
    }

    toggle_auto_exclude(value:boolean){
        // Handle toggle of auto exclude switch
        this.profile.options.auto_exclude_threshold = value ? 5 : null
        this.save()
    }
}

</script>


<style lang='sass' scoped>

@import 'src/styles/utils.sass'


h2
    margin-top: 56px
    margin-bottom: 12px
    margin-left: 12px
    font-size: 24px

.v-input
    margin-bottom: 18px

.address
    // Stand out more by removing usual opacity
    @include themed(color, black, white)

.reactions
    display: flex
    margin: 24px 0

    &:not(.allowed)
        filter: grayscale(0.8)

    > *
        width: 48px !important
        height: 48px !important
        margin-right: 12px

</style>

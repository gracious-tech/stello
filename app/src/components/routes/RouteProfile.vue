
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
                p(class='text-center')
                    span(v-if='profile.smtp_ready') {{ profile.email }}
                    app-btn(@click='show_email_dialog')
                        | {{ profile.smtp_ready ? "Change" : "Connect email account" }}


        h2 Identity
        v-card
            v-card-text
                p(class='body-2 text--secondary' v-t='"identity.p1"')
                route-profile-identity(:profile='profile')


        h2 Responses
        v-card
            v-card-text
                app-switch(v-model='allow_replies' v-bind='$t("allow_replies")')
                app-switch(v-model='allow_reactions' v-bind='$t("allow_reactions")')
                app-switch(v-model='smtp_no_reply' v-bind='$t("smtp_no_reply")'
                    :hint='smtp_no_reply_hint' :disabled='!allow_replies' :disabled_value='false')
                app-select(v-model='notify_mode' :items='notify_mode_items' select
                    v-bind='$t("notify_mode")')
                app-switch(v-model='notify_include_contents' v-bind='$t("notify_include_contents")'
                    color='error' :disabled='cant_include_contents' :disabled_value='false')


        h2 Message expiry
        v-card
            v-card-text
                app-integer(v-model='msg_lifespan' v-bind='$t("msg_lifespan")' :min='1' :max='365'
                    infinity)
                app-integer(v-model='msg_max_reads' v-bind='$t("msg_max_reads")' :min='1' infinity)
                app-switch(disabled v-model='allow_delete' v-bind='$t("allow_delete")')
                app-switch(disabled v-model='allow_resend_requests' v-bind='$t("allow_resend_requests")')


        //- h2 Auto-exclude recipients
        //- v-card
        //-     v-card-text
        //-         div(class='body-2 text--secondary')
        //-             p(v-t='"auto_exclude.p1"')
        //-             p(v-t='"auto_exclude.p2"')
        //-             p(v-t='"auto_exclude.p3"')
        //-         app-switch(:value='auto_exclude' @input='toggle_auto_exclude'
        //-             v-bind='$t("auto_exclude_switch")' disabled)
        //-         app-integer(v-model='auto_exclude_threshold' v-bind='$t("auto_exclude_threshold")'
        //-             :min='1' :max='100' :disabled='!auto_exclude' style='max-width: 400px')
        //-         app-select(v-model='auto_exclude_exempt_groups' :items='groups_ui' multiple
        //-             v-bind='$t("auto_exclude_exempt_groups")' :disabled='!auto_exclude')


        //- h2 Additional security
        //- v-card
        //-     v-card-text
        //-         app-switch(disabled v-model='social_referral_ban' v-bind='$t("social_referral_ban")')


</template>


<i18n>
en:
    # Email
    email:
        p1: "Stello uses your email address to send messages and receive notifications about replies."
    # Identity
    identity:
        p1: "How emails and other notifications identify you prior to opening messages. Unlike messages, this information does not expire and will remain in recipients' inboxes, likely for all eternity."
    # Replies
    allow_replies:
        label: "Allow comments"
        hint: "Allow recipients to comment on message sections"
    allow_reactions:
        label: "Allow reactions"
        hint: "Allow recipients to react to message sections"
    smtp_no_reply:
        label: "Warn against replying by email"
    notify_mode:
        label: "Notification frequency"
        hint: "How often Stello should notify you about responses to your messages"
    notify_include_contents:
        label: "Include contents of replies in emails"
        hint: "When Stello notifies you of a new reply it will include the actual contents of the reply in the email notification. This means the contents, while still private, is not end-to-end encrypted."
    # Message expiry
    msg_lifespan:
        label: "Expire after"
        hint: "The default number of days until messages expire"
        suffix: "days"
    msg_max_reads:
        label: "Lose access after opening"
        hint: "The default number of times each recipient can open a message before they lose access"
        suffix: "times"
    allow_delete:
        label: "Allow deleting before expiry"
        hint: "Allow recipients to delete their own copy of a message before it actually expires"
    allow_resend_requests:
        label: "Allow resend requests"
        hint: "Allow recipients to request that you resend a message that has expired before they could read it. You still must approve any such requests."
    # Auto-exclude
    auto_exclude:
        p1: "Automatically stop sending messages to contacts who aren't reading them."
        p2: "Some contacts may be too polite to unsubscribe, and some may even opt to send your messages to spam instead. In which case it is best to stop sending messages to those who aren't reading them."
        p3: "If enabled, contacts will be auto-excluded at the time of sending, even if they are still members of the group being sent to (the same as if they had unsubscribed). This will not affect contacts who are added individually as recipients though, only when part of a group."
    auto_exclude_switch:
        label: "Enable"
    auto_exclude_threshold:
        label: "Auto-exclude if haven't read"
        prefix: "any of last"
        suffix: "messages"
    auto_exclude_exempt_groups:
        label: "Don't apply to contacts in groups"
        hint: "Auto-exclude will never apply to any contacts in these groups (e.g. groups for your family or financial supporters)"
    # Additional security
    social_referral_ban:
        label: "Ban social media sharing"
        hint: "Prevent anyone from reading messages if they are shared on social media by one of your recipients. This provides only limited protection, so you should still delete messages that have been exposed on social media."
</i18n>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import RouteProfileHost from '@/components/routes/assets/RouteProfileHost.vue'
import DialogEmailSettings from '@/components/dialogs/reuseable/DialogEmailSettings.vue'
import RouteProfileIdentity from '@/components/routes/assets/RouteProfileIdentity.vue'
import RouteProfileSteps from '@/components/routes/assets/RouteProfileSteps.vue'
import {Profile} from '@/services/database/profiles'
import {Task, task_manager} from '@/services/tasks/tasks'


const UPLOADED_CONFIG_OPTIONS = [
    'notify_mode', 'notify_include_contents', 'allow_replies', 'allow_reactions', 'allow_delete',
    'allow_resend_requests', 'social_referral_ban', 'reaction_options',
]


// Helper for adding getters/setters for profile options
function options_to_computed_props(props:string[]){
    const computed = {}
    for (const prop of props){
        computed[prop] = {
            get: function(){
                return this.profile.options[prop]
            },
            set: function(value){
                this.profile.options[prop] = value
                if (UPLOADED_CONFIG_OPTIONS.includes(prop)){
                    this.profile.host_state.displayer_config_uploaded = false
                    this.profile.host_state.responder_config_uploaded = false
                }
                this.save()
            },
        }
    }
    return computed
}


@Component({
    components: {RouteProfileHost, RouteProfileIdentity, RouteProfileSteps},
    computed: {
        ...options_to_computed_props([
            'notify_mode', 'notify_include_contents', 'allow_replies', 'allow_reactions',
            'allow_delete', 'allow_resend_requests', 'auto_exclude_threshold',
            'auto_exclude_exempt_groups', 'smtp_no_reply', 'social_referral_ban',
        ]),
    },
})
export default class extends Vue {
    // NOTE Code organised by database record, where as template organised by user friendliness

    @Prop() profile_id:string

    profile:Profile = null
    groups_ui = []
    notify_mode_items = [
        {value: 'none', text: "None"},
        {value: 'first_new_reply', text: "Once until Stello opened"},
        {value: 'replies', text: "Every reply"},
        {value: 'replies_and_reactions', text: "Every reply & reaction"},
    ]

    async created(){
        // Get the profile for the given id, and groups (needed for auto_exclude_exempt_groups)
        const [profile, groups] = await Promise.all([
            self._db.profiles.get(this.profile_id),
            self._db.groups.list(),
        ])
        this.groups_ui = groups.map(g => {
            return {text: g.display, value: g.id}
        })
        this.profile = profile
    }

    async destroyed(){
        // Check if configs need uploading when leaving
        if (this.profile?.configs_need_uploading){
            task_manager.start_configs_update(this.profile_id)
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

    @Watch('$tm.data.finished') async watch_tm_finished(task:Task):Promise<void>{
        // Listen to task completions and adjust state as needed
        if (task.name === 'send_oauth_setup' && task.params[1] === this.profile.id){
            // Reload profile to get latest email related settings
            this.profile = await self._db.profiles.get(this.profile.id)
        }
    }

    save(){
        // Save changes to profile
        self._db.profiles.set(this.profile)
    }

    show_email_dialog(){
        // Show dialog for configurable smtp settings
        this.$store.dispatch('show_dialog', {
            component: DialogEmailSettings,
            props: {
                profile: this.profile,
            },
        })
    }

    toggle_auto_exclude(value){
        // Handle toggle of auto exclude switch
        this.profile.options.auto_exclude_threshold = value ? 5 : null
        this.save()
    }
}

</script>


<style lang='sass' scoped>

h2
    margin-top: 56px
    margin-bottom: 12px
    margin-left: 12px
    font-size: 24px

.v-input
    margin-bottom: 18px

</style>

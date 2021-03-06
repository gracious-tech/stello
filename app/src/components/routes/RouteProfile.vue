
<template lang='pug'>

div
    v-toolbar
        app-btn(to='../' icon='arrow_back')
        v-toolbar-title {{ profile ? profile.display : "" }}

    route-profile-steps(v-if='profile && !profile.setup_complete' :profile='profile')
    app-content(v-else-if='profile' class='pa-3')

        h2 Message Storage
        v-card
            v-card-text
                p Where your messages are stored for recipients to view them
                route-profile-host(:profile='profile')
            v-card-actions
                app-btn(disabled color='error') Remove account


        h2 Email
        v-card
            v-card-text
                p(class='body-2 text--secondary' v-t='"email.p1"')
                route-profile-email(:profile='profile' ref='route_profile_email')
                p(class='text-center')
                    app-btn(@click='test_email_settings' :loading='email_loading')
                        | Test email settings


        h2 Identity
        v-card
            v-card-text
                p(class='body-2 text--secondary' v-t='"identity.p1"')
                route-profile-identity(:profile='profile')


        h2 Replies
        v-card
            v-card-text
                app-switch(v-model='allow_replies' v-bind='$t("allow_replies")')
                app-switch(v-model='allow_reactions' v-bind='$t("allow_reactions")')
                app-switch(v-model='smtp_no_reply' v-bind='$t("smtp_no_reply")'
                    :disabled='!allow_replies' :disabled_value='false')
                app-select(v-model='notify_mode' :items='notify_mode_items'
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


        h2 Auto-exclude recipients
        v-card
            v-card-text
                div(class='body-2 text--secondary')
                    p(v-t='"auto_exclude.p1"')
                    p(v-t='"auto_exclude.p2"')
                    p(v-t='"auto_exclude.p3"')
                app-switch(:value='auto_exclude' @input='toggle_auto_exclude'
                    v-bind='$t("auto_exclude_switch")' disabled)
                app-integer(v-model='auto_exclude_threshold' v-bind='$t("auto_exclude_threshold")'
                    :min='1' :max='100' :disabled='!auto_exclude' style='max-width: 400px')
                app-select(v-model='auto_exclude_exempt_groups' :items='groups_ui' multiple
                    v-bind='$t("auto_exclude_exempt_groups")' :disabled='!auto_exclude')


        h2 Additional security
        v-card
            v-card-text
                app-switch(disabled v-model='social_referral_ban' v-bind='$t("social_referral_ban")')


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
        label: "Allow replies"
        hint: "Allow recipients to reply to your messages"
    allow_reactions:
        label: "Allow reactions"
        hint: "Allow recipients to react to your messages"
    smtp_no_reply:
        label: "Prevent replies via email"
        hint: "Make it more difficult for recipients to reply to email notifications so that they reply securely via Stello instead"
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
        label: "Expire after opening"
        hint: "The default number of times a message can be opened by a recipient before it expires"
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

import {Component, Vue, Prop} from 'vue-property-decorator'

import RouteProfileHost from '@/components/routes/assets/RouteProfileHost.vue'
import RouteProfileEmail from '@/components/routes/assets/RouteProfileEmail.vue'
import RouteProfileIdentity from '@/components/routes/assets/RouteProfileIdentity.vue'
import RouteProfileSteps from '@/components/routes/assets/RouteProfileSteps.vue'
import {Profile} from '@/services/database/profiles'
import {update_configs} from '@/services/configs'


const UPLOADED_CONFIG_OPTIONS = ['notify_mode', 'notify_include_contents', 'allow_replies',
    'allow_reactions', 'allow_delete', 'allow_resend_requests', 'social_referral_ban']


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
    components: {RouteProfileHost, RouteProfileEmail, RouteProfileIdentity, RouteProfileSteps},
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

    @Prop() profile_id

    profile:Profile = null
    groups_ui = []
    notify_mode_items = [
        {value: 'none', text: "None"},
        {value: 'first_new_reply', text: "Once until Stello opened"},
        {value: 'replies', text: "Every reply"},
        {value: 'replies_and_reactions', text: "Every reply & reaction"},
    ]
    email_loading = false

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
        if (this.profile.configs_need_uploading){
            update_configs(await this.$store.dispatch('new_task'), this.profile)
        }
    }

    get is_default(){
        return this.profile.id === this.$store.state.default_profile
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

    save(){
        // Save changes to profile
        self._db.profiles.set(this.profile)
    }

    async test_email_settings(){
        // Confirm email settings are valid
        this.email_loading = true
        const success = await (this.$refs.route_profile_email as any).test()
        this.email_loading = false
        if (success){
            // NOTE Error info handled and displayed by RouteProfileEmail
            this.$store.dispatch('show_snackbar', "Success, your email settings are correct!")
        }
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
    margin-top: 36px
    margin-bottom: 12px
    margin-left: 12px
    font-size: 16px

.v-input
    margin-bottom: 18px

</style>

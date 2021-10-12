
<template lang='pug'>

v-stepper(:value='setup_step' @change='change_step')
    v-stepper-header(class='app-bg-primary-relative')
        v-stepper-step(:step='1' :complete='setup_step > 1' :editable='setup_step > 1'
            edit-icon='$complete' color='accent') Storage
        v-stepper-step(:step='2' :complete='setup_step > 2' :editable='setup_step > 2'
            edit-icon='$complete' color='accent') Email
        v-stepper-step(:step='3' :complete='setup_step > 3' :editable='setup_step > 3'
            edit-icon='$complete' color='accent') Security
        v-stepper-step(:step='4' color='accent') Identity

    v-stepper-items

        v-stepper-content(:step='0')
            h1(class='text-h4 text-center my-6 mb-4') New sending account
            img.decor_intro(src='@/assets/decor/setup_intro.png')
            p Create as many accounts as you need, such as to...
            ul
                li
                    | Send a different newsletter
                    br
                    span(class='text--secondary')
                        | So unsubscribes for one newsletter do not apply to all
                li
                    | Represent a different identity
                    br
                    span(class='text--secondary') Such as having a personal and a business account
                li
                    | Send in another language
                    br
                    span(class='text--secondary') So each reader gets emailed in their own language

            div.nav
                span &nbsp;
                app-btn(@click='next_step' raised) Next

        v-stepper-content(:step='1')
            img.decor(src='@/assets/decor/setup_storage.png')
            h3(class='text-h6 my-6') Who should store your messages?
            route-profile-storage(:profile='profile' @plan='plan_choice = $event')
            div.nav
                app-btn(@click='prev_step' raised color='') Prev
                app-btn(@click='next_step' :disabled='!plan_choice && !profile.host' raised) Next

        v-stepper-content(:step='2')
            img.decor(src='@/assets/decor/setup_email.png')
            h3(class='text-h6 my-6') Which email address do you want to send from?
            p(class='text--secondary body-2 mb-12') Stello will use it to send messages on your
                |  behalf, and notify you of any replies.
            div.email_done(v-if='profile.smtp_ready')
                div(class='row align-center justify-center mb-1 text-h5')
                    strong(@click='show_email_dialog("init")' class='clickable') {{ profile.email }}
                    app-svg.correct(name='icon_done' class='app-fg-accent-relative')
                v-alert(v-if='profile.smtp.oauth' class='mt-4' color='#ffc400' text)
                    | Ensure this is the address you'd like to send emails from, and not just
                    | another account you own.
                div
                    app-btn(@click='show_email_dialog("init")' small color='primary' raised)
                        | Change address
            div.email_options(v-else)
                //- WARN Keep in sync with duplicate in DialogEmailSettings.vue
                div
                    app-btn(@click='email_oauth("google")' raised color='' light class='mr-3')
                        app-svg(name='icon_google' class='mr-3')
                        | Gmail
                    div(class='text--secondary body-2') Including any address that uses Gmail app
                div
                    app-btn(@click='email_oauth("microsoft")' raised color='' light class='mr-3')
                        app-svg(name='icon_microsoft' class='mr-3')
                        | Outlook
                    div(class='text--secondary body-2')
                        | Including any address that uses Microsoft 365
                div
                    app-btn(@click='show_email_dialog("email")' raised color='' light) Other
            div.nav
                app-btn(@click='prev_step' raised color='') Prev
                app-btn(@click='next_step' :disabled='!profile.smtp_ready' raised) Next

        v-stepper-content(:step='3')
            img.decor(src='@/assets/decor/setup_security.png')
            h2(class='text-h6 my-6') How important is security to you?
            p(class='text--secondary body-2 mb-8') These can be customised in more detail later on.
            v-list
                //- Choice only mandatory after first choice (so nothing selected initially)
                v-list-item-group(v-model='security_choice' :mandatory='security_choice !== null')
                    v-list-item(v-for='(option, i) of security_options' :key='option.code')
                        v-list-item-icon
                            app-svg(
                                :name='`icon_radio_${security_choice === i ? "" : "un"}checked`')
                        v-list-item-content
                            v-list-item-title {{ option.title }}
                            v-list-item-subtitle {{ option.subtitle1 }}
                            v-list-item-subtitle {{ option.subtitle2 }}
            div.nav
                app-btn(@click='prev_step' raised color='') Prev
                app-btn(@click='next_step' :disabled='security_choice === null' raised) Next

        v-stepper-content(:step='4')
            img.decor(src='@/assets/decor/setup_id.png')
            h2(class='text-h6 my-6') How would you like to identify yourself?
            p(class='text--secondary body-2') When inviting contacts to read your messages
            app-security-alert(class='my-12') Personalize so recipients trust it's you,
                |  but don't include anything sensitive as this info will not expire
            route-profile-identity(:profile='profile' steps)
                route-profile-username(v-if='!profile.host || profile.host.cloud === "gracious"'
                    :generic_domain='profile.options.generic_domain'
                    @available='username_choice = $event')
            div.nav
                app-btn(@click='prev_step' raised color='') Prev
                div.done
                    template(v-if='account_create_error')
                        p(class='error--text') {{ account_create_error }}
                        br
                    app-btn(@click='done_return' :disabled='done_disabled' raised) Done
                    br
                    app-btn(@click='done' :disabled='done_disabled') Customise further

</template>


<script lang='ts'>

import {Route} from 'vue-router'
import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import RouteProfileUsername from '@/components/routes/assets/RouteProfileUsername.vue'
import RouteProfileStorage from '@/components/routes/assets/RouteProfileStorage.vue'
import DialogEmailSettings from '@/components/dialogs/reuseable/DialogEmailSettings.vue'
import RouteProfileIdentity from '@/components/routes/assets/RouteProfileIdentity.vue'
import {Profile} from '@/services/database/profiles'
import {OAuthIssuer, oauth_pretask_new_usage} from '@/services/tasks/oauth'
import {AccountsCreateError, create_account} from '@/services/hosts/gracious_user'
import {MustReconnect} from '@/services/utils/exceptions'


@Component({
    components: {RouteProfileUsername, RouteProfileIdentity, RouteProfileStorage},
})
export default class extends Vue {

    @Prop() profile!:Profile

    plan_choice:'christian'|'other'|null = null
    username_choice:string|null = null
    security_choice:number|null = null
    account_create_error:string|null = null

    security_options = [
        {
            code: 'standard',
            title: "Standard security",
            subtitle1: "Private but also easy to use",
            subtitle2: "(default message expiry 1 year)",
            settings: {
                options: {
                    notify_include_contents: true,
                    allow_delete: false,
                    smtp_no_reply: false,
                    social_referral_ban: false,
                    generic_domain: false,
                },
                msg_options_security: {
                    lifespan: 365,
                    max_reads: Infinity,
                },
            },
        },
        {
            code: 'high',
            title: "High security",
            subtitle1: "Sacrifice some convenience for security",
            subtitle2: "(default message expiry 1 month)",
            settings: {
                options: {
                    notify_include_contents: false,
                    allow_delete: true,
                    smtp_no_reply: true,
                    social_referral_ban: true,
                    generic_domain: true,
                },
                msg_options_security: {
                    lifespan: 30,
                    max_reads: 10,
                },
            },
        },
        {
            code: 'very_high',
            title: "Very high security",
            subtitle1: "Force my recipients to read quickly and reply securely",
            subtitle2: "(default message expiry 1 week)",
            settings: {
                // Ideally keep these in sync with defaults in database/profiles.ts
                options: {
                    notify_include_contents: false,
                    allow_delete: true,
                    smtp_no_reply: true,
                    social_referral_ban: true,
                    generic_domain: true,
                },
                msg_options_security: {
                    lifespan: 7,
                    max_reads: 3,
                },
            },
        },
    ]

    get setup_step():number{
        // Access to setup_step that correctly excludes null as a possibility (this comp won't show)
        return this.profile.setup_step as number
    }
    set setup_step(value:number){
        this.profile.setup_step = value
        void self.app_db.profiles.set(this.profile)
    }

    get done_disabled(){
        // Whether setup completion buttons are disabled
        if (!this.profile.host && !this.username_choice){
            return true
        }
        return !this.profile.msg_options_identity.sender_name
    }

    @Watch('security_choice') watch_security_choice(){
        // Apply security choice whenever it changes
        // NOTE While value is initially null, watch will only ever receive a number

        // Update profile settings
        const settings = this.security_options[this.security_choice!]!.settings
        this.profile.options.notify_include_contents = settings.options.notify_include_contents
        this.profile.options.allow_delete = settings.options.allow_delete
        this.profile.options.smtp_no_reply = settings.options.smtp_no_reply
        this.profile.options.social_referral_ban = settings.options.social_referral_ban
        this.profile.options.generic_domain = settings.options.generic_domain
        this.profile.msg_options_security.lifespan = settings.msg_options_security.lifespan
        this.profile.msg_options_security.max_reads = settings.msg_options_security.max_reads

        // Add an extra line to invite tmpls if message will expire
        if (this.profile.msg_options_security.lifespan !== Infinity){
            const paragraph =
                `<p>(message will expire in <span data-mention data-id='msg_lifespan'></span>)</p>`
            if (!this.profile.msg_options_identity.invite_tmpl_email.includes('msg_lifespan')){
                this.profile.msg_options_identity.invite_tmpl_email += paragraph
            }
            if (!this.profile.options.reply_invite_tmpl_email.includes('msg_lifespan')){
                this.profile.options.reply_invite_tmpl_email += paragraph
            }
        }
        void self.app_db.profiles.set(this.profile)
    }

    prev_step(){
        // Go to prev step
        this.setup_step -= 1
    }

    next_step(){
        // Go to next step (assumes current one already completed)
        this.setup_step += 1
    }

    change_step(step:number){
        // Handle changes of step triggered by the stepper component tabs etc
        this.setup_step = step
    }

    email_oauth(issuer:OAuthIssuer){
        // Start task for setting up oauth for email sending
        void oauth_pretask_new_usage('send_oauth_setup', [this.profile.id], issuer)
    }

    show_email_dialog(force_step:string){
        // Show dialog for configuring smtp settings
        void this.$store.dispatch('show_dialog', {
            component: DialogEmailSettings,
            props: {
                profile: this.profile,
                force_step,
            },
        })
    }

    async done(){
        // Finish setting up profile

        // Create account if hosting with GT
        if (!this.profile.host){

            // Prevent user interaction until done
            void this.$store.dispatch('show_waiting', "Finishing account setup...")

            try {
                const result = await create_account(
                    this.username_choice!, this.profile.email, this.plan_choice!)
                this.profile.host = {
                    cloud: 'gracious',
                    username: this.username_choice!,
                    password: result.password,
                    federated_id: result.federated_id,
                    id_token: result.id_token,
                    id_token_exires: result.id_token_expires,
                }
            } catch (error){

                // Ensure an error message is displayed
                this.account_create_error = "Something went wrong :("

                // Set a more useful error message if possible
                if (error instanceof MustReconnect){
                    this.account_create_error = "Couldn't connect"
                } else if (error instanceof AccountsCreateError){
                    if (error.message === 'username_invalid' || error.message === 'username_taken'){
                        this.account_create_error = "Please try a different username"
                    } else if (error.message === 'ip_limit_day'){
                        this.account_create_error =
                            "Please wait a day before making any more accounts"
                    } else if (error.message === 'ip_limit_fortnight'){
                        this.account_create_error =
                            "Please wait a couple of weeks before making any more accounts"
                    }
                } else {
                    // Report this unusual error
                    self.app_report_error(error)
                }

                // Can't complete setup
                return false

            } finally {
                // Ensure waiting dialog always closes, otherwise can't interact anymore
                void this.$store.dispatch('close_dialog')
            }
        }

        // Complete steps (reveals normal profile settings UI)
        this.profile.setup_step = null
        void self.app_db.profiles.set(this.profile)

        // Make this the default profile if none yet
        if (!this.$store.state.default_profile){
            this.$store.commit('dict_set', ['default_profile', this.profile.id])
        }

        // Assign any profileless drafts to this profile
        for (const draft of await self.app_db.drafts.list()){
            if (!draft.profile){
                draft.profile = this.profile.id
                await self.app_db.drafts.set(draft)
            }
        }

        return true
    }

    async done_return(){
        // Complete steps and return to draft (if came from there) or otherwise root
        if (! await this.done()){
            return  // Something went wrong
        }
        const prev_route = this.$store.state.tmp.prev_route as Route
        if (prev_route.name === 'draft'){
            void this.$router.push({name: 'draft', params: prev_route.params})
        } else {
            void this.$router.push('/')
        }
        void this.$store.dispatch('show_snackbar', "Account created")
    }
}


</script>


<style lang='sass' scoped>

@import 'src/styles/globals.sass'


.v-stepper
    display: flex
    flex-direction: column
    width: 100%
    margin: 0 auto
    @include themed(background-color, #ddd, transparent)  // Decor doesn't work if bg too light
    flex-grow: 1

    .v-stepper__header
        width: 100%
        justify-content: center
        flex-wrap: nowrap
        user-select: none

        ::v-deep

            .v-stepper__step--editable, .v-stepper__step--active

                .v-stepper__step__step
                    color: var(--on_accent) !important

                svg
                    color: var(--on_accent)
                    fill: currentColor
                    padding: 4px

            .v-stepper__label
                margin-left: 8px

                @media (min-width: (600px + $stello_sidebar_width))
                    display: flex  // Ensure labels shown earlier than 959px (Vuetify's default)

    .v-stepper__items
        width: 100%
        overflow-y: auto  // Allow scrolling of page
        flex-grow: 1

        .v-stepper__content
            // Limit content area width and center
            width: 100%
            max-width: $content-width
            margin: 0 auto
            padding-bottom: 300px

            &.tab-reverse-transition-leave-active
                // Fix reserve animation that doesn't make old tab fully leave before disappearing
                padding-left: $stello_sidebar_width !important
                min-width: 100vw !important

.nav
    display: flex
    justify-content: space-between
    margin-top: 36px

    .done
        display: flex
        flex-direction: column
        align-items: flex-end

.v-list-item--active
    &.v-list-item--link:before
        background-color: var(--accent_darker)

    ::v-deep
        svg, .v-list-item__title
            color: var(--accent_lighter)

.email_done
    text-align: center

    .correct
        margin-left: 24px
        width: 80px
        height: 80px

.email_options
    > div
        display: flex
        align-items: center
        margin-bottom: 24px
        margin-left: 24px

.decor
    position: absolute
    @include themed(opacity, 1, 0.3)  // Doesn't stand out as much on light bg
    margin-left: -400px
    min-width: 350px
    max-width: 350px

.decor_intro
    margin: 48px auto
    width: 100%
    max-width: 300px

</style>

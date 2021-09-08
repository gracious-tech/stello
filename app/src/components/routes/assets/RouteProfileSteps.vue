
<template lang='pug'>

v-stepper(:value='profile.setup_step' @change='change_step')
    v-stepper-header(class='app-bg-primary-relative')
        v-stepper-step(:step='1' :complete='profile.setup_step > 1' :editable='profile.setup_step > 1'
            edit-icon='$complete' color='accent') Email
        v-stepper-step(:step='2' :complete='profile.setup_step > 2' :editable='profile.setup_step > 2'
            edit-icon='$complete' color='accent') Storage
        v-stepper-step(:step='3' :complete='profile.setup_step > 3' :editable='profile.setup_step > 3'
            edit-icon='$complete' color='accent') Security
        v-stepper-step(:step='4' color='accent') Identity

    v-stepper-items

        v-stepper-content(:step='0')
            h1(class='text-h4 text-center mb-4') New sending account
            img.decor_intro(src='@/assets/decor/setup_intro.png')
            p Accounts are what Stello uses to send your messages, securely storing them for recipients to view.
            p(class='text--secondary body-2') You can have multiple accounts, such as a personal account and a ministry account.
            div.nav
                span &nbsp;
                app-btn(@click='next_step') Next

        v-stepper-content(:step='1')
            img.decor(src='@/assets/decor/setup_email.png')
            h3(class='text-h6 my-6') Which email address do you want to send from?
            p(class='text--secondary body-2 mb-12') Stello will use it to send messages on your behalf, and notify you of any replies.
            p(class='text-center')
                span(v-if='profile.smtp_ready') {{ profile.email }}
                app-btn(@click='show_email_dialog')
                    | {{ profile.smtp_ready ? "Change" : "Connect email account" }}
            div.nav
                app-btn(@click='prev_step') Prev
                app-btn(@click='next_step' :disabled='!profile.smtp_ready') Next

        v-stepper-content(:step='2')
            img.decor(src='@/assets/decor/setup_storage.png')
            h3(class='text-h6 my-6') Where should your messages be stored?
            p(class='text--secondary body-2 mb-12') You can store them with the creators of Stello, or provide your own storage (only recommended for experts). Wherever they are stored they will be securely encrypted.
            p(v-if='profile.host.cloud' class='text-center text--secondary text-h5')
                | Storage confirmed
            route-profile-host(:profile='profile')
            div.nav
                app-btn(@click='prev_step') Prev
                app-btn(@click='next_step' :disabled='!profile.host.cloud') Next

        v-stepper-content(:step='3')
            img.decor(src='@/assets/decor/setup_security.png')
            h2(class='text-h6 my-6') How important is security to you?
            p(class='text--secondary body-2 mb-8') These can be customised in more detail later on.
            v-list
                //- Choice only mandatory after first choice (so nothing selected initially)
                v-list-item-group(v-model='security_choice' :mandatory='security_choice !== null')
                    v-list-item(v-for='(option, i) of security_options' :key='option.code')
                        v-list-item-icon
                            app-svg(:name='`icon_radio_${security_choice === i ? "" : "un"}checked`')
                        v-list-item-content
                            v-list-item-title {{ option.title }}
                            v-list-item-subtitle {{ option.subtitle1 }}
                            v-list-item-subtitle {{ option.subtitle2 }}
            div.nav
                app-btn(@click='prev_step') Prev
                app-btn(@click='next_step' :disabled='security_choice === null') Next

        v-stepper-content(:step='4')
            img.decor(src='@/assets/decor/setup_id.png')
            h2(class='text-h6 my-6') How would you like to identify yourself?
            p(class='text--secondary body-2') When inviting contacts to read your messages
            app-security-alert(class='my-12') Personalize so recipients trust it's you, but don't include anything sensitive as invitation text does not expire
            route-profile-identity(:profile='profile' steps)
            div.nav
                app-btn(@click='prev_step') Prev
                div.done
                    app-btn(@click='done_return'
                        :disabled='!profile.msg_options_identity.sender_name') Done
                    br
                    app-btn(@click='done' :disabled='!profile.msg_options_identity.sender_name'
                        color='') Customise further

</template>


<script lang='ts'>

import {Route} from 'vue-router'
import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import RouteProfileHost from '@/components/routes/assets/RouteProfileHost.vue'
import DialogEmailSettings from '@/components/dialogs/reuseable/DialogEmailSettings.vue'
import RouteProfileIdentity from '@/components/routes/assets/RouteProfileIdentity.vue'
import {Profile} from '@/services/database/profiles'


@Component({
    components: {RouteProfileHost, RouteProfileIdentity},
})
export default class extends Vue {

    @Prop() profile:Profile

    security_choice = null
    security_options = [
        {
            code: 'standard',
            title: "Standard security",
            subtitle1: "Private but also easy to use",
            settings: {
                options: {
                    notify_include_contents: true,
                    allow_delete: false,
                    smtp_no_reply: false,
                    social_referral_ban: false,
                },
                msg_options_security: {
                    lifespan: Infinity,
                    max_reads: Infinity,
                },
            },
        },
        {
            code: 'high',
            title: "High security",
            subtitle1: "Sacrifice some convenience for security",
            subtitle2: "Messages expire after a month",
            settings: {
                options: {
                    notify_include_contents: false,
                    allow_delete: true,
                    smtp_no_reply: true,
                    social_referral_ban: true,
                },
                msg_options_security: {
                    lifespan: 31,
                    max_reads: 10,
                },
            },
        },
        {
            code: 'very_high',
            title: "Very high security",
            subtitle1: "Force my recipients to read quickly and reply securely",
            subtitle2: "Messages expire after a week",
            settings: {
                // Ideally keep these in sync with defaults in database/profiles.ts
                options: {
                    notify_include_contents: false,
                    allow_delete: true,
                    smtp_no_reply: true,
                    social_referral_ban: true,
                },
                msg_options_security: {
                    lifespan: 7,
                    max_reads: 3,
                },
            },
        },
    ]

    @Watch('security_choice') watch_security_choice(){
        // Apply security choice whenever it changes
        const settings = this.security_options[this.security_choice].settings
        for (const [prop, value] of Object.entries(settings.options)){
            this.profile.options[prop] = value
        }
        for (const [prop, value] of Object.entries(settings.msg_options_security)){
            this.profile.msg_options_security[prop] = value
        }
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
        self.app_db.profiles.set(this.profile)
    }

    prev_step(){
        // Go to prev step
        this.profile.setup_step -= 1
        self.app_db.profiles.set(this.profile)
    }

    next_step(){
        // Go to next step (assumes current one already completed)
        this.profile.setup_step += 1
        self.app_db.profiles.set(this.profile)
    }

    change_step(step:number){
        // Handle changes of step triggered by the stepper component tabs etc
        this.profile.setup_step = step
        self.app_db.profiles.set(this.profile)
    }

    show_email_dialog(){
        // Show dialog for configuring smtp settings
        this.$store.dispatch('show_dialog', {
            component: DialogEmailSettings,
            props: {
                profile: this.profile,
            },
        })
    }

    async done(){
        // Complete steps (reveals normal profile settings UI)
        this.profile.setup_step = null
        self.app_db.profiles.set(this.profile)

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
    }

    async done_return(){
        // Complete steps and return to draft (if came from there) or otherwise root
        await this.done()  // Need to wait for draft to be assigned this profile before nav
        const prev_route = this.$store.state.tmp.prev_route as Route
        if (prev_route.name === 'draft'){
            this.$router.push({name: 'draft', params: prev_route.params})
        } else {
            this.$router.push('/')
        }
        this.$store.dispatch('show_snackbar', "Account created")
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

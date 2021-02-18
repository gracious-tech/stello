
<template lang='pug'>

v-stepper(:value='profile.setup_step' @change='change_step')
    v-stepper-header
        v-stepper-step(:step='1' :complete='profile.setup_step > 1' :editable='profile.setup_step > 1'
            edit-icon='$complete' color='accent') Storage
        v-stepper-step(:step='2' :complete='profile.setup_step > 2' :editable='profile.setup_step > 2'
            edit-icon='$complete' color='accent') Email
        v-stepper-step(:step='3' :complete='profile.setup_step > 3' :editable='profile.setup_step > 3'
            edit-icon='$complete' color='accent') Identity
        v-stepper-step(:step='4' color='accent') Security

    v-stepper-items

        v-stepper-content(:step='1')
            h1(class='text-h4 text-center mb-4') New sending account
            img.decor(src='_assets/decor_new_account.png')
            template(v-if='profile.host.cloud')
                p(class='text-center text--secondary text-h5') Storage confirmed
            template(v-else)
                p Accounts are what Stello uses to send your messages, securely storing them for recipients to view.
                p(class='text--secondary body-2') You can have multiple accounts, such as a personal account and a ministry account.
            route-profile-host(:profile='profile')
            div.nav
                span &nbsp;
                app-btn(@click='next_step' :disabled='!profile.host.cloud') Next

        v-stepper-content(:step='2')
            h3(class='text-h6 my-6') What are your email account details?
            p(class='text--secondary body-2 mb-12') Stello will send messages on your behalf, and notify you of any replies.
            app-email-settings(:profile='profile' ref='app_email_settings')
            div.nav
                app-btn(@click='prev_step' :disabled='loading') Prev
                app-btn(@click='next_step_after_email' :disabled='!email_looks_done'
                    :loading='loading') Next

        v-stepper-content(:step='3')
            h2(class='text-h6 my-6') How would you like to identify yourself?
            p(class='text--secondary body-2') When inviting contacts to read your messages
            app-security-alert(class='my-12') This information is used outside of actual messages, so does not expire and should not include anything sensitive
            route-profile-identity(:profile='profile' :clipboard='false')
            div.nav
                app-btn(@click='prev_step') Prev
                app-btn(@click='next_step' :disabled='!profile.msg_options_identity.sender_name') Next

        v-stepper-content(:step='4')
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
                div.done
                    app-btn(@click='done_return' :disabled='security_choice === null') Done
                    br
                    app-btn(@click='done' :disabled='security_choice === null' color='')
                        | Customise further

</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import RouteProfileHost from '@/components/routes/assets/RouteProfileHost.vue'
import AppEmailSettings from '@/components/reuseable/AppEmailSettings.vue'
import RouteProfileIdentity from '@/components/routes/assets/RouteProfileIdentity.vue'
import {Profile} from '@/services/database/profiles'
import {email_address_like} from '@/services/utils/misc'


@Component({
    components: {RouteProfileHost, AppEmailSettings, RouteProfileIdentity},
})
export default class extends Vue {

    @Prop() profile:Profile

    loading = false
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
            subtitle2: "Messages expire after a few weeks",
            settings: {
                options: {
                    notify_include_contents: false,
                    allow_delete: true,
                    smtp_no_reply: true,
                    social_referral_ban: true,
                },
                msg_options_security: {
                    lifespan: 7 * 3,
                    max_reads: 10,
                },
            },
        },
        {
            code: 'very_high',
            title: "Very high security",
            subtitle1: "Force my recipients to read quickly and reply securely",
            subtitle2: "Messages expire after a few days",
            settings: {
                // Ideally keep these in sync with defaults in database/profiles.ts
                options: {
                    notify_include_contents: false,
                    allow_delete: true,
                    smtp_no_reply: true,
                    social_referral_ban: true,
                },
                msg_options_security: {
                    lifespan: 3,
                    max_reads: 1,
                },
            },
        },
    ]

    get email_looks_done(){
        // Whether email address input looks to be valid
        return email_address_like(this.profile.email)
    }

    @Watch('security_choice') watch_security_choice(){
        // Apply security choice whenever it changes
        const settings = this.security_options[this.security_choice].settings
        for (const [prop, value] of Object.entries(settings.options)){
            this.profile.options[prop] = value
        }
        for (const [prop, value] of Object.entries(settings.msg_options_security)){
            this.profile.msg_options_security[prop] = value
        }
        self._db.profiles.set(this.profile)
    }

    prev_step(){
        // Go to prev step
        this.profile.setup_step -= 1
        self._db.profiles.set(this.profile)
    }

    next_step(){
        // Go to next step (assumes current one already completed)
        this.profile.setup_step += 1
        self._db.profiles.set(this.profile)
    }

    async next_step_after_email(){
        // Only go to next step if email setup properly
        this.loading = true
        const success = await (this.$refs.app_email_settings as any).test()
        this.loading = false
        if (success){
            this.next_step()
        }
    }

    change_step(step){
        // Handle changes of step triggered by the stepper component tabs etc
        this.profile.setup_step = step
        self._db.profiles.set(this.profile)
    }

    async done(){
        // Complete steps (reveals normal profile settings UI)
        this.profile.setup_step = null
        self._db.profiles.set(this.profile)

        // Clear prev_location in case was set before creating profile
        this.$store.commit('tmp_set', ['prev_location', null])

        // Make this the default profile if none yet
        if (!this.$store.state.default_profile){
            this.$store.commit('dict_set', ['default_profile', this.profile.id])
        }

        // Assign any profileless drafts to this profile
        for (const draft of await self._db.drafts.list()){
            if (!draft.profile){
                draft.profile = this.profile.id
                await self._db.drafts.set(draft)
            }
        }
    }

    async done_return(){
        // Complete steps and return to previous location
        const location = this.$store.state.tmp.prev_location ?? '/'
        await this.done()  // Need to wait for draft to be assigned this profile before nav
        this.$router.push(location)
        this.$store.dispatch('show_snackbar', "Account created")
    }
}


</script>


<style lang='sass' scoped>

.v-stepper
    display: flex
    flex-direction: column
    width: 100%
    margin: 0 auto
    background-color: transparent

    .v-stepper__header
        width: 100%
        background-color: $primary_darker
        justify-content: center
        flex-wrap: nowrap
        user-select: none

        ::v-deep

            .v-stepper__step--editable, .v-stepper__step--active

                .v-stepper__step__step
                    color: $on_accent !important

                svg
                    color: $on_accent
                    fill: currentColor
                    padding: 4px

            .v-stepper__label
                margin-left: 8px

                @media (min-width: (600px + $stello_sidebar_width))
                    display: flex  // Ensure labels shown earlier than 959px (Vuetify's default)

    .v-stepper__items
        width: 100%
        overflow-y: auto  // Allow scrolling of page

        .v-stepper__content
            // Limit content area width and center
            width: 100%
            max-width: $content-width
            margin: 0 auto

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
        background-color: $accent_darker

    ::v-deep
        svg, .v-list-item__title
            color: $accent_lighter


.decor
    margin: 48px auto
    width: 100%
    max-width: 300px


</style>

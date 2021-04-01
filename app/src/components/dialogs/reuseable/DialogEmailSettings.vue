
<template lang='pug'>

v-card
    v-card-title {{ title }}

    //- Choose auth type (oauth or other)
    v-card-text(v-if='setup === "init"')
        div.oauth_row
            app-btn(@click='oauth_google' raised color='' light class='mr-3')
                app-svg(name='icon_google' class='mr-3')
                | Gmail
            div(class='text--secondary body-2') @gmail.com or other addresses that use Gmail
        div.oauth_row
            app-btn(@click='oauth_microsoft' raised color='' light class='mr-3')
                app-svg(name='icon_microsoft' class='mr-3')
                | Outlook
            div(class='text--secondary body-2') @hotmail.com, @outlook.com, etc
        div.oauth_row
            app-btn(@click='setup = "email"' raised color='' light) Other

    //- Choose email address (user didn't select an oauth option)
    v-card-text(v-if='setup === "email"')
        app-text(v-model='init_email' v-bind='$t("email")')

    //- Choose host settings (couldn't auto-detect)
    v-card-text(v-if='setup === "settings"')
        div {{ email }} #[app-btn(@click='setup = "init"') Change]
        app-text(v-model='smtp_host' v-bind='$t("smtp_host")'
            :placeholder='profile.smtp_settings.host')
        app-integer(v-model='smtp_port' :buttons='false' :inherit='profile.smtp_settings.port'
            v-bind='$t("smtp_port")')
        app-switch(v-model='smtp_starttls' v-bind='$t("smtp_starttls")')

    //- Signin with oauth
    v-card-text(v-if='setup === "signin"')
        div {{ email }} #[app-btn(@click='setup = "init"') Change]
        div.oauth_row
            app-btn(@click='oauth_signin_detected' raised color='' light class='mr-3')
                app-svg(:name='oauth_signin_icon' class='mr-3')
                | Sign in

    //- Auth with username/password
    v-card-text(v-if='setup === "password"')
        div {{ email }} #[app-btn(@click='setup = "init"') Change]
        p(v-if='!profile.smtp_detected' class='my-4')
            | #[strong Server] {{ profile.smtp_settings.host }}:{{ profile.smtp_settings.port }}
            app-btn(@click='setup = "settings"') Change
        app-password(v-model='smtp_pass' :error='error && !smtp_pass' v-bind='$t("smtp_pass")'
            class='external-hint')
        p(class='hint text--secondary body-2')
            template(v-if='not_detected')
                | We recommend using an "#[a(:href='url_app_pass') app password]" rather than your normal password, if your email account supports them.
            template(v-else)
                | Don't use your normal password (which probably won't work). Instead, ensure you have #[a(:href='url_two_step') Two-Step Verification] enabled and create a new #[a(:href='url_app_pass') "app password"].
        app-text(v-if='!profile.smtp_detected' v-model='smtp_user' v-bind='$t("smtp_user")'
            :placeholder='profile.smtp_settings.user')

    v-alert(v-if='error' colored-border border='left' color='error' class='ma-4 mb-0')
        h1(class='text-h6 mb-3') Could not connect
        ul(class='body-2')
            template(v-if='error.code === "network"')
                li You don't seem to be connected to the Internet
                li Make sure no anti-virus software is blocking Stello
            template(v-if='error.code === "dns" && not_detected')
                li Your server name is likely incorrect (#[a(:href='smtp_settings_search') search for correct settings])
            template(v-if='error.code === "starttls_required" && not_detected && !smtp_starttls')
                li Try enabling STARTTLS
            template(v-if='error.code === "tls_required" && not_detected && smtp_starttls')
                li Try disabling STARTTLS
            template(v-if='error.code === "auth"')
                li Your {{ not_detected ? "username" : "email address" }} and/or password is incorrect
                li You may need to use an #[a(:href='url_app_pass') "app password"] rather than your normal password
                    ul
                        li You may need to enable #[a(:href='url_two_step') Two-Step Verification] before creating an app password
            template(v-if='error.code === "timeout"')
                li(v-if='not_detected') Your server name or port may be incorrect (#[a(:href='smtp_settings_search') search for correct settings])
                li Your Internet connection may be very slow
        p(class='text-center')
            app-btn(:href='error_mailto' small) Contact Support

    v-card-actions
        app-btn(@click='cancel') Cancel
        v-spacer
        app-btn(v-if='setup !== "init"' @click='next' :disabled='next_disabled' :loading='loading')
            | {{ setup === 'password' ? "Finish" : "Continue" }}

</template>


<i18n>
en:
    email:
        label: "Email address"
    smtp_user:
        label: "Username"
        hint: "This is usually the same as your email address"
    smtp_pass:
        label: "App password"
    smtp_host:
        label: "Server name"
    smtp_port:
        label: "Port"
        hint: "This will usually be either 465 or 587"
    smtp_starttls:
        label: "Use STARTTLS"
        hint: "Usually required if using port 587 (full TLS otherwise)"
</i18n>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import {debounce_set} from '@/services/misc'
import {EmailError} from '@/services/native/types'
import {email_address_like} from '@/services/utils/misc'
import {Profile, SMTP_PROVIDERS} from '@/services/database/profiles'
import {test_email_settings, dns_mx} from '@/services/native/native'
import {OAuthIssuer, oauth_pretask_new_usage} from '@/services/tasks/oauth'


@Component({})
export default class extends Vue {

    @Prop() profile:Profile

    setup:'init'|'email'|'settings'|'signin'|'password' = 'init'
    init_email:string = ''  // Address entered in initial setup phase (not auto-saved to profile)
    error:EmailError = null
    loading:boolean = false

    async created(){
        // Detect best state to put the UI in
        if (this.profile.smtp.oauth){
            this.setup = 'init'  // Have oauth already so user must be wanting to change address
        } else if (this.profile.smtp_oauth_supported){
            this.setup = 'signin'  // Detected oauth provider but not auth'd yet
        } else if (this.profile.smtp_detected || this.profile.smtp.pass){
            this.setup = 'password'  // Detected settings already or already confirmed custom ones
        } else if (this.profile.email){
            this.setup = 'settings'  // Email present but settings not confirmed yet
        }
    }

    get title(){
        // Return different title for dialog depending on stage of setup
        switch (this.setup){
            case 'email':
                return "Enter email address"
            case 'settings':
                return "Enter SMTP settings"
            case 'signin':
                return "Signin to your email account"
            case 'password':
                return "Enter your password"
        }
        return "Connect email account"
    }

    get not_detected():boolean{
        // True if smtp settings have not been auto-set based on a known provider
        return !this.profile.smtp_detected
    }

    get url_app_pass():string{
        // Return app pass url if provider is known
        if (this.profile.smtp_detected){
            return this.profile.smtp_detected_config.app_pass.url
        }
        // Provider unknown so search instead
        const query = `Create app password "${this.profile.email_domain}"`
        return 'https://duckduckgo.com/?q=' + encodeURIComponent(query)
    }

    get url_two_step():string{
        // Return two step url if provider is known
        if (this.profile.smtp_detected){
            return this.profile.smtp_detected_config.app_pass.url_two_step
        }
        // Provider unknown so search instead
        const query = `Two-Step Verification "${this.profile.email_domain}"`
        return 'https://duckduckgo.com/?q=' + encodeURIComponent(query)
    }

    get oauth_signin_icon(){
        // Return icon representing provider of oauth that has been detected already
        return 'icon_' + this.profile.smtp_detected
    }

    get next_disabled(){
        // Whether continue/next button should be disabled
        if (this.setup === 'email' && !email_address_like(this.init_email)){
            return true
        } else if (this.setup === 'password' && !this.smtp_pass){
            return true
        }
        return false
    }

    get smtp_settings_search():string{
        // Get url for a search for smtp settings for the email's domain
        const query = `smtp server port "${this.profile.email_domain}"`
        return 'https://duckduckgo.com/?q=' + encodeURIComponent(query)
    }

    get error_mailto():string{
        // Get mailto uri with debugging info for current error
        return self._debug_to_mailto(self._error_to_debug(this.error))
    }

    // GET/SET PROFILE PROPERTIES

    get email(){
        return this.profile.email
    }  // Setting requires special handling via `change_email()`

    get smtp_user(){
        return this.profile.smtp.user
    }
    @debounce_set() set smtp_user(value){
        this.profile.smtp.user = value
        this.save()
    }

    get smtp_pass(){
        return this.profile.smtp.pass
    }
    @debounce_set() set smtp_pass(value){
        this.profile.smtp.pass = value
        this.save()
    }

    get smtp_host(){
        return this.profile.smtp.host
    }
    @debounce_set() set smtp_host(value){
        this.profile.smtp.host = value
        this.save()
    }

    get smtp_port(){
        return this.profile.smtp.port
    }
    @debounce_set() set smtp_port(value){
        this.profile.smtp.port = value
        this.save()
    }

    get smtp_starttls(){
        return this.profile.smtp.starttls
    }
    set smtp_starttls(value){
        this.profile.smtp.starttls = value
        this.save()
    }

    // WATCH

    @Watch('setup') watch_setup():void{
        // Ensure error and loading is cleared whenever change setup step
        this.error = null
        this.loading = false
    }

    // METHODS

    save(){
        // Save changes to profile
        self._db.profiles.set(this.profile)
    }

    async change_email(){
        // Change the email address used for the profile
        this.loading = true

        // If not actually changed, don't wipe out other settings
        if (this.profile.email !== this.init_email){

            // Change email and reset all smtp settings as assumed to have changed too
            this.profile.email = this.init_email
            this.profile.host_state.responder_config_uploaded = false
            this.profile.smtp = {
                oauth: null,
                user: '',
                pass: '',
                host: '',
                port: null,
                starttls: false,
            }

            // Auto-detect host via DNS if not known from email's domain already
            // Especially useful for the many domains using Google email hosting
            if (!this.profile.smtp_detected){
                const mx_domain = (await dns_mx(this.profile.email_domain))[0]
                if (mx_domain){
                    for (const provider of Object.values(SMTP_PROVIDERS)){
                        if ('mx_base' in provider && mx_domain.endsWith('.' + provider.mx_base)){
                            // Just set host, as profile will auto-detect rest based on that
                            this.profile.smtp.host = provider.host  // Avoid debounce
                            break
                        }
                    }

                }
            }

            // Save changes
            this.save()
        }

        // Go to next setup step depending on whether settings were detected or not
        if (this.profile.smtp_detected){
            this.setup = this.profile.smtp_oauth_supported ? 'signin' : 'password'
        } else if (this.smtp_pass){
            // Password has already been set, so host settings may already work so don't guess them
            this.setup = 'settings'
        } else {
            // Couldn't detect settings but can try guess host/port instead
            const port_465_error = await test_email_settings({
                ...this.profile.smtp_settings,
                port: 465,
                starttls: false,
            }, false)
            if (!port_465_error){
                // Port 465 worked
                this.profile.smtp.port = 465
                this.profile.smtp.starttls = false
                this.save()
                this.setup = 'password'
            } else {
                // Try 587
                const port_587_error = await test_email_settings({
                    ...this.profile.smtp_settings,
                    port: 587,
                    starttls: true,
                }, false)
                if (!port_587_error){
                    // Port 587 worked
                    this.profile.smtp.port = 587
                    this.profile.smtp.starttls = true
                    this.save()
                    this.setup = 'password'
                } else {
                    this.setup = 'settings'
                }
            }
        }
        this.loading = false
    }

    async confirm_host(){
        // Check host settings and continue to password settings if work
        this.loading = true
        this.error = null
        this.error = await test_email_settings(this.profile.smtp_settings, false)
        if (!this.error){
            this.setup = 'password'
        }
        this.loading = false
    }

    oauth_signin(issuer:OAuthIssuer, email?:string):void{
        // Signin using oauth and close dialog (since task manager will handle redirect)
        oauth_pretask_new_usage('send_oauth_setup', [this.profile.id], issuer, email)
        this.$emit('close')
    }

    oauth_signin_detected(){
        // Signin using the already detected provider
        this.oauth_signin(this.profile.smtp_detected as OAuthIssuer, this.email)
    }

    oauth_google(){
        // Init auth for a Google account
        // NOTE Do not provide email since probably changing address, not keeping any existing
        this.oauth_signin('google')
    }

    oauth_microsoft(){
        // Init auth for a Microsoft account
        // NOTE Do not provide email since probably changing address, not keeping any existing
        this.oauth_signin('microsoft')
    }

    async test():Promise<void>{
        // Test the current email settings
        this.loading = true
        this.error = null
        this.error = await test_email_settings(this.profile.smtp_settings)
        if (!this.error){
            this.$emit('close')
        }
        this.loading = false
    }

    cancel(){
        // Cancel email setup by closing dialog
        this.$emit('close')
    }

    next(){
        // Go to next setup step
        if (this.setup === 'email'){
            this.change_email()
        } else if (this.setup === 'settings'){
            this.confirm_host()
        } else if (this.setup === 'password'){
            this.test()
        }
    }
}

</script>


<style lang='sass' scoped>

.oauth_row
    display: flex
    align-items: center
    margin: 36px 0

.v-text-field
    margin: 24px 0

.external-hint
    margin-bottom: 0

    ::v-deep .v-text-field__details
        display: none  // Using custom hint element instead

.hint
    margin-bottom: 36px

.v-alert
    padding-left: 24px
    background-color: rgba($error, 0.1)

    .error-msg
        opacity: 0.5
        font-size: 12px

    a:not([href])
        color: inherit !important
        cursor: inherit

</style>
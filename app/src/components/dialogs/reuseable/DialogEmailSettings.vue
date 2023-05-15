
<template lang='pug'>

v-card
    v-card-title {{ title }}

    //- Choose auth type (oauth or other)
    //- WARN Keep in sync with duplicate in RouteProfileSteps.vue
    v-card-text(v-if='setup === "init"')
        div.oauth_row
            app-btn(@click='oauth_google' raised color='' light class='mr-3')
                app-svg(name='icon_google' class='mr-3')
                | Gmail
            div(class='text--secondary body-2') Including any address that uses Gmail app
        div.oauth_row
            app-btn(@click='oauth_microsoft' raised color='' light class='mr-3')
                app-svg(name='icon_microsoft' class='mr-3')
                | Outlook
            div(class='text--secondary body-2') Including any address that uses Microsoft 365
        div.oauth_row
            app-btn(@click='setup = "email"' raised color='' light) Other

    //- Choose email address (user didn't select an oauth option)
    v-card-text(v-if='setup === "email"')
        app-text(v-model='init_email' v-bind='$t("email")')

    //- Choose host settings (couldn't auto-detect)
    v-card-text(v-if='setup === "settings"')
        div {{ email }} #[app-btn(@click='setup = "init"' small) Change]
        app-security-alert(v-if='smtpless' class='mt-3') {{ smtpless }}
        app-text(v-model='smtp_host' v-bind='$t("smtp_host")'
            :placeholder='profile.smtp_settings.host' persistent-placeholder)
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
        div {{ email }} #[app-btn(@click='setup = "init"' small) Change]
        p(v-if='!profile.smtp_detected' class='my-4')
            | #[strong Server] {{ profile.smtp_settings.host }}:{{ profile.smtp_settings.port }}
            app-btn(@click='setup = "settings"' small) Change
        app-password(v-model='tmp_pass' :error='error && !tmp_pass' v-bind='$t("smtp_pass")'
            class='external-hint')
        p(class='hint text--secondary body-2')
            template(v-if='not_detected').
                We recommend using an "#[app-a(:href='url_app_pass') app password]" rather than
                your normal password, if your email account supports them.
            template(v-else).
                Don't use your normal password (which probably won't work). Instead, ensure you
                have #[app-a(:href='url_two_step') Two-Step Verification] enabled and create a
                new #[app-a(:href='url_app_pass') "app password"].
        app-text(v-if='!profile.smtp_detected' v-model='smtp_user' v-bind='$t("smtp_user")'
            :placeholder='profile.smtp_settings.user' persistent-placeholder)
        app-security-alert.
            Never give your email password to anything you don't fully trust.
            Stello encrypts your password, it stays on your device, and is only used to send emails
            (not read them). And this can be checked as Stello is open-source.

    v-alert(v-if='error' colored-border border='left' color='error' class='ma-4 mb-0')
        h1(class='text-h6 mb-3') Could not connect
        ul(class='body-2')
            template(v-if='error.code === "network"')
                li Make sure you are connected to the Internet
                li.
                    If you have anti-virus that scans emails (e.g. AVG) you may need to
                    #[app-a(href='https://stello.news/guide/problem-connecting/') reconfigure it]
            template(v-if='error.code === "port" && not_detected')
                li The port number given is incorrect
            template(v-if='error.code === "dns" && not_detected')
                li.
                    Your server name is likely incorrect
                    (#[app-a(:href='smtp_settings_search') search for correct settings])
            template(v-if='error.code === "starttls_required" && not_detected && !smtp_starttls')
                li Try enabling STARTTLS
            template(v-if='error.code === "tls_required" && not_detected && smtp_starttls')
                li Try disabling STARTTLS
            template(v-if='error.code === "auth"')
                li.
                    Your {{ not_detected ? "username" : "email address" }} and/or password is
                    incorrect
                li
                    | You may need to use an #[app-a(:href='url_app_pass') "app password"] rather
                    | than your normal password
                    ul
                        li.
                            You may need to enable
                            #[app-a(:href='url_two_step') Two-Step Verification]
                            before creating an app password
                li(v-if='profile.smtp_detected === "psmail"')
                    | PSMail may not yet support sending using an alias (use your login address)
            template(v-if='error.code === "timeout"')
                li(v-if='not_detected').
                    Your server name or port may be incorrect
                    (#[app-a(:href='smtp_settings_search') search for correct settings])
                li Your Internet connection may be very slow
                li There may be a problem with your email provider's server
        p(class='text-center mt-3')
            app-btn(:href='error_support_url' small) Contact Support

    v-card-actions
        app-btn(@click='cancel') Cancel
        v-spacer
        app-btn(v-if='setup !== "init"' @click='next' :disabled='next_disabled' :loading='loading')
            | {{ setup === 'password' ? "Finish" : "Continue" }}

</template>


<script lang='ts'>


const i18n = {
    email: {
        label: "Email address",
    },
    smtp_user: {
        label: "Username",
        hint: "This is usually the same as your email address",
    },
    smtp_pass: {
        label: "Email password",
    },
    smtp_host: {
        label: "SMTP server name",
    },
    smtp_port: {
        label: "SMTP port",
        hint: "This will usually be either 465 or 587",
    },
    smtp_starttls: {
        label: "STARTTLS",
        label_false: "TLS",
        hint: "STARTTLS is usually required when using port 587",
    },
}


import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import {EmailError, EmailSettings} from '@/services/native/types'
import {email_address_like} from '@/services/utils/misc'
import {Profile, SMTP_PROVIDERS} from '@/services/database/profiles'
import {OAuthIssuer, oauth_pretask_new_usage} from '@/services/tasks/oauth'
import {external_decrypt, external_encrypt} from '@/services/misc/external_crypt'


export type EmailSetupStep = 'init'|'email'|'settings'|'signin'|'password'


const SMTPLESS:Record<string, string> = {
    protonmail: `ProtonMail only allows other apps to send emails if you have a paid account and have setup "ProtonMail Bridge" on your computer already.`,
    tutanota: `Tutanota does not allow other apps to send emails. You must use a different email address which will still benefit from the security that Stello itself provides.`,
}


const SMTPLESS_DOMAINS:Record<string, string> = {
    'protonmail.com': 'protonmail',
    'proton.me': 'protonmail',
    'pm.me': 'protonmail',
    'tutanota.com': 'tutanota',
    'tutanota.de': 'tutanota',
    'tutamail.com': 'tutanota',
    'tuta.io': 'tutanota',
    'keemail.me': 'tutanota',
}


@Component({
    i18n: {messages: {en: i18n}},
})
export default class extends Vue {

    @Prop() declare readonly profile:Profile
    @Prop({type: String, default: null}) declare readonly force_step:EmailSetupStep|null

    setup:EmailSetupStep = 'init'
    init_email = ''  // Address entered in initial setup phase (not auto-saved to profile)
    error:EmailError|null = null
    error_report_id:string|null = null
    loading = false
    tmp_pass = ''

    async created(){
        // Init tmp_pass
        if (this.profile.smtp.pass){
            try {
                this.tmp_pass = await external_decrypt(this.profile.smtp.pass)
            } catch {
                // Failed to decrypt so leave pass empty
            }
        }

        // Detect best state to put the UI in
        if (this.force_step){
            this.setup = this.force_step
        } else if (this.profile.smtp.oauth){
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
                return "Enter password for your email account"
        }
        return "Connect email account"
    }

    get smtpless():string|null{
        // A warning message specific to the user's email provider if it doesn't support SMTP
        const domain = this.email.split('@').at(-1)?.toLowerCase() ?? ''
        if (domain in SMTPLESS_DOMAINS){
            return SMTPLESS[SMTPLESS_DOMAINS[domain]!]!
        }
        return null
    }

    get not_detected():boolean{
        // True if smtp settings have not been auto-set based on a known provider
        return !this.profile.smtp_detected
    }

    get url_app_pass():string{
        // Return app pass url if provider is known
        if (this.profile.smtp_detected_config?.app_pass){
            return this.profile.smtp_detected_config.app_pass.url
        }
        // Provider unknown so search instead
        const query = `Create app password "${this.profile.email_domain ?? ''}"`
        return 'https://duckduckgo.com/?q=' + encodeURIComponent(query)
    }

    get url_two_step():string{
        // Return two step url if provider is known
        if (this.profile.smtp_detected_config?.app_pass){
            return this.profile.smtp_detected_config.app_pass.url_two_step
        }
        // Provider unknown so search instead
        const query = `Two-Step Verification "${this.profile.email_domain ?? ''}"`
        return 'https://duckduckgo.com/?q=' + encodeURIComponent(query)
    }

    get oauth_signin_icon(){
        // Return icon representing provider of oauth that has been detected already
        return 'icon_' + this.profile.smtp_detected!
    }

    get next_disabled(){
        // Whether continue/next button should be disabled
        if (this.setup === 'email' && !email_address_like(this.init_email)){
            return true
        } else if (this.setup === 'password' && !this.tmp_pass){
            return true
        }
        return false
    }

    get smtp_settings_search():string{
        // Get url for a search for smtp settings for the email's domain
        const query = `smtp server port "${this.profile.email_domain ?? ''}"`
        return 'https://duckduckgo.com/?q=' + encodeURIComponent(query)
    }

    get error_support_url():string{
        // Get support url with debugging info for current error
        let desc = "I was trying to...\n\nBut...\n\n\n----------TECHNICAL DETAILS----------\n"
            + `Email error: ${this.error!.code}\nDetails: ${this.error!.details}`
        if (this.error_report_id){
            desc += `\nError report: ${this.error_report_id}`
        }
        return `https://gracious.tech/support/stello/error/?desc=${encodeURIComponent(desc)}`
    }

    // GET/SET PROFILE PROPERTIES

    get email(){
        return this.profile.email
    }  // Setting requires special handling via `change_email()`

    get smtp_user(){
        return this.profile.smtp.user
    }
    set smtp_user(value){
        this.profile.smtp.user = value
        this.save()
    }

    get smtp_host(){
        return this.profile.smtp.host
    }
    set smtp_host(value){
        this.profile.smtp.host = value
        this.save()
    }

    get smtp_port(){
        return this.profile.smtp.port
    }
    set smtp_port(value){
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

    @Watch('error') watch_error():void{
        // If an unknown error occurs, submit a report for it
        this.error_report_id = null  // Always reset since error has changed
        if (this.error?.code === 'unknown'){
            this.error_report_id = self.app_report_error(
                new Error(`Unknown smtp error: ${this.error.details}`))
        }
    }

    // METHODS

    save(){
        // Save changes to profile
        void self.app_db.profiles.set(this.profile)
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
                pass: null,
                host: '',
                port: null,
                starttls: false,
            }

            // Auto-detect host via DNS if not known from email's domain already
            // Especially useful for the many domains using Google email hosting
            // WARN Cannot detect all, as some use 3p filters that obscure the real host
            // e.g. https://help.proofpoint.com/Proofpoint_Essentials/Email_Security/Administrator_Topics/hostedemailservices/Configuring_Office_365_for_Proofpoint_Essentials
            if (!this.profile.smtp_detected && !this.smtpless && this.profile.email_domain){
                const mx_domain = (await self.app_native.dns_mx(this.profile.email_domain))[0]
                if (mx_domain){
                    for (const provider of Object.values(SMTP_PROVIDERS)){
                        if ('mx_base' in provider && mx_domain.endsWith('.' + provider.mx_base)){
                            // Just set host, as profile will auto-detect rest based on that
                            this.profile.smtp.host = provider.host
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
        } else if (this.smtpless){
            // Host doesn't support standard SMTP, so require manual settings and show warning
            this.setup = 'settings'
        } else if (this.profile.smtp.pass){
            // Password has already been set, so host settings may already work so don't guess them
            this.setup = 'settings'
        } else {
            // Couldn't detect settings but can try guess host/port instead
            const port_465_error = await self.app_native.test_email_settings({
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
                const port_587_error = await self.app_native.test_email_settings({
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
        this.error = await self.app_native.test_email_settings(this.profile.smtp_settings, false)
        if (!this.error){
            this.setup = 'password'
        }
        this.loading = false
    }

    oauth_signin(issuer:OAuthIssuer, email?:string):void{
        // Signin using oauth and close dialog (since task manager will handle redirect)
        void oauth_pretask_new_usage('send_oauth_setup', [this.profile.id], issuer, email)
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
        this.error = await self.app_native.test_email_settings({
            ...this.profile.smtp_settings,
            pass: this.tmp_pass,
        } as EmailSettings)
        if (!this.error){
            // Password worked, so save it (smtp settings detected as done when password exists)
            this.profile.smtp.pass = await external_encrypt(this.tmp_pass)
            this.save()
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
            void this.change_email()
        } else if (this.setup === 'settings'){
            void this.confirm_host()
        } else if (this.setup === 'password'){
            void this.test()
        }
    }
}

</script>


<style lang='sass' scoped>

.oauth_row
    display: flex
    align-items: center
    margin: 36px 0

    .v-btn
        text-transform: none

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
    background-color: rgba(var(--error_num), 0.1)

    .error-msg
        opacity: 0.5
        font-size: 12px

    a:not([href])
        color: inherit !important
        cursor: inherit

</style>

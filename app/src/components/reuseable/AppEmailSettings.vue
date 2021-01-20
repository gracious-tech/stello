
<template lang='pug'>

div
    app-text(v-model='email' v-bind='$t("email")' :error='tested && !email')

    template(v-if='email_looks_done')
        app-password.password(v-model='smtp_pass' label="App Password" :error='tested && !smtp_pass')
        p.password-hint(class='text--secondary body-2')
            template(v-if='show_all_fields')
                | We recommend using an "app password" rather than your normal password, which can be created in your email account settings.
            template(v-else)
                | Don't use your normal password (which probably won't work). Instead, ensure you have #[a(:href='url_two_step' target='_blank') Two-Step Verification] enabled and create a new #[a(:href='url_app_pass' target='_blank') "app password"].

        template(v-if='show_all_fields')
            app-text(v-model='smtp_user' :placeholder='email' v-bind='$t("smtp_user")')
            app-text(v-model='smtp_host' v-bind='$t("smtp_host")' :error='tested && !smtp_host')
            app-text(v-model='smtp_port' placeholder='465' v-bind='$t("smtp_port")')

        v-alert(v-if='error' colored-border border='left' color='error')
            h1(class='text-h6 mb-3') Could not connect
            ul(class='body-2')
                template(v-if='error.code === "ETIMEDOUT"')
                    li(v-if='show_all_fields') Your "host" may be incorrect
                        ul
                            li If you can access your messages using Gmail (even if you usually use another program) enter "smtp.gmail.com"
                            li Otherwise search for "smtp settings" for your email provider
                    li(v-if='show_all_fields') Your "port" may be incorrect (try 465 or 587)
                    li Your Internet may be extremely slow or disconnected
                template(v-if='error.code === "ESOCKET"')
                    li Make sure you are connected to the Internet
                    li Make sure any anti-virus software isn't blocking Stello
                template(v-if='error.code === "EDNS"')
                    li(v-if='show_all_fields') Your "host" is likely incorrect
                        ul
                            li If you can access your messages using Gmail (even if you usually use another program) enter "smtp.gmail.com"
                            li Otherwise search for "smtp settings" for your email provider
                    li Your Internet may be extremely slow or disconnected
                template(v-if='error.code === "EAUTH"')
                    li Your email address and/or password may be incorrect
                    li You may need to use an #[a(:href='url_app_pass' target='_blank') "app password"] rather than your normal password
                        ul
                            li This is a special password created each time you connect a new app
                            li You may need to enable #[a(:href='url_two_step' target='_blank') Two-Step Verification] before you can create an app password
                            li(v-if='show_all_fields') Search for "app password" for your email provider
            //- NOTE error.message already includes error.response if it exists
            p.error-msg(class='mt-6') {{ error.code }}: {{ error.message }}
            p(class='text-center')
                app-btn(href='mailto:support@gracious.tech' raised small) Contact Support

</template>


<i18n>
en:
    email:
        label: "Email Address"
    smtp_user:
        label: "Username"
        hint: "This is usually the same as your email address"
    smtp_host:
        label: "Host"
        hint: "If you use Gmail, enter \"smtp.gmail.com\". Otherwise search for \"smtp settings\" for your email provider."
    smtp_port:
        label: "Port"
        hint: "This will usually be either 465 (most common) or 587"
</i18n>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Profile} from '@/services/database/profiles'
import {debounce_set} from '@/services/misc'
import {test_email_settings} from '@/services/native'
import {email_address_like} from '@/services/utils/misc'


@Component({})
export default class extends Vue {

    @Prop() profile:Profile

    tested = false
    error = null

    get show_all_fields():boolean{
        // Whether to show all fields because the provider is not automatically known
        return !this.profile.smtp_provider
    }

    get url_app_pass():string{
        // Return app pass url if provider is known
        if (this.profile.smtp_provider){
            return this.profile.smtp_provider_config.app_pass.url
        }
        return null
    }

    get url_two_step():string{
        // Return two step url if provider is known
        if (this.profile.smtp_provider){
            return this.profile.smtp_provider_config.app_pass.url_two_step
        }
        return null
    }

    get email(){
        return this.profile.email
    }
    @debounce_set() set email(value){
        this.profile.email = value
        this.profile.host_state.responder_config_uploaded = false
        this.save()
    }

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

    get email_looks_done(){
        // Whether email looks done (so show other form options)
        return email_address_like(this.email)
    }

    save(){
        self._db.profiles.set(this.profile)
    }

    async test():Promise<boolean>{
        // Test the current email settings and return success boolean (also triggers error display)
        this.tested = true
        this.error = null
        if (!this.email || !this.smtp_pass || (this.show_all_fields && !this.smtp_host)){
            return false  // These fields have no defaults and will highlight red now `tested` true
        }
        this.error = await test_email_settings(this.profile.smtp_settings)
        return !this.error  // Return success boolean (parent components access this)
    }
}

</script>


<style lang='sass' scoped>

.v-text-field
    margin: 24px 0

.password
    margin-bottom: 0

    ::v-deep .v-text-field__details
        display: none  // Using custom hint element instead

.password-hint
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

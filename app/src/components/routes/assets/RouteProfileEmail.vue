
<template lang='pug'>

div
    app-text(v-model='email' v-bind='$t("email")')

    template(v-if='email_looks_done')
        app-password(v-model='smtp_pass' :label='is_app_pass ? "App Password" : "Password"'
            :hint='is_app_pass ? "" : $t("password.hint")')

        p(v-if='is_app_pass' class='text--secondary body-2') Do not use your normal password (it won't work). Instead, #[a(:href='profile.smtp_provider_config.app_pass.url' target='_blank') create an "app password"]. If asked for a name, you can give any (such as "Stello"). Also ensure you have enabled #[a(:href='profile.smtp_provider_config.app_pass.url_two_step' target='_blank') 2-Step Verification] for your account before you try to create the app password.

        template(v-if='!profile.smtp_provider')
            app-text(v-model='smtp_user' :placeholder='email' v-bind='$t("smtp_user")')
            app-text(v-model='smtp_host' v-bind='$t("smtp_host")')
            app-text(v-model='smtp_port' placeholder='465' v-bind='$t("smtp_port")')

</template>


<i18n>
en:
    email:
        label: "Email Address"
    password:
        hint: "You may need to create an \"app password\" rather than use your normal one"
    smtp_user:
        label: "Username"
        hint: "This is usually the same as your email address"
    smtp_host:
        label: "Host"
        hint: 'Search for "smtp settings" for your email account to discover the host address'
    smtp_port:
        label: "Port"
        hint: "You usually won't need to change this"
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

    get is_app_pass(){
        return !!this.profile.smtp_provider_config?.app_pass
    }

    save(){
        self._db.profiles.set(this.profile)
    }
}

</script>


<style lang='sass' scoped>

.v-text-field
    margin: 24px 0

</style>

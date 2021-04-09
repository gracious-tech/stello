
<template lang='pug'>

v-card
    v-card-title Request new storage

    v-card-text
        p(class='mb-4 text-body-1') Gracious Tech currently provides free storage, and you may request it here. You'll receive an email response within 24 hours with access to your storage.

        app-text(v-model='email' label="Email address")

        app-text(v-model='username' :loading='!!username_checking' :error-messages='username_error'
            label="Preferred username"
            hint="This will appear at the start of links to your messages, but is otherwise not important")

        app-security-alert Your username is not encrypted, so you may wish to use a pseudonym if you require high security

        app-select(v-model='use_case' :items='use_cases' label="What will you use this for?")


    v-card-actions
        app-btn(@click='dismiss') Cancel
        app-btn(@click='submit' :disabled='!ready') Submit

</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import app_config from '@/app_config.json'
import {Profile} from '@/services/database/profiles'
import {validate_subdomain} from '@/services/hosts/common'
import {email_address_like} from '@/services/utils/misc'
import {debounce_method} from '@/services/misc'
import {drop} from '@/services/utils/exceptions'


@Component({})
export default class extends Vue {

    @Prop() profile:Profile

    email:string = ''

    username:string = ''
    username_checking:string = null  // The last username that a check was initiated for
    username_checked:string = null  // The last username that a check was completed for
    username_checked_available:boolean = null  // Whether the checked username is available

    use_case:string = null

    use_cases = [
        {value: 'ministry', text: "Christian ministry"},
        {value: 'charity_christian', text: "Christian charity"},
        {value: 'charity_other', text: "Other charities"},
        {value: 'other', text: "Other"},
    ]

    created(){
        // Auto-set email field from profile
        this.email = this.profile.email
    }

    get username_valid():boolean{
        // Whether username has valid chars
        return validate_subdomain(this.username) === null
    }

    get username_error(){
        // Error with username, if any
        if (!this.username){
            return
        } else if (!this.username_valid){
            return validate_subdomain(this.username)
        } else if (this.username_checking){
            return
        } else if (this.username === this.username_checked && !this.username_checked_available){
            return "Not available"
        }
        return
    }

    get ready():boolean{
        // Whether ready to submit
        return email_address_like(this.email)
            && this.username === this.username_checked
            && this.username_checked_available
            && !!this.use_case
    }

    @Watch('username') watch_username():void{
        // Check username is available whenever it changes
        if (this.username_valid){
            this.check_availability(this.username)
        }
    }

    @debounce_method() async check_availability(value:string){
        // Check if username is available
        this.username_checking = value
        fetch(`https://${value}.s3.amazonaws.com`, {method: 'HEAD'}).then(resp => {
            // Only process if username hasn't changed in the meantime (and sent another request)
            if (this.username_checking === value){
                this.username_checking = null
                this.username_checked = value
                this.username_checked_available = resp.status === 404
            }
        })

    }

    async submit(){
        // Submit request
        const resp = await drop(fetch(app_config.author.post, {
            method: 'POST',
            body: JSON.stringify({
                app: app_config.codename,
                type: 'new_storage',
                version: app_config.version,
                email: this.email,
                username: this.username,
                use_case: this.use_case,
            }),
        }))
        if (resp?.ok){
            this.$store.dispatch('show_snackbar',
                "Request submitted (you'll receive a reply by email within 24 hours)")
            this.$emit('close')
        } else {
            this.$store.dispatch('show_snackbar', "Failed to submit request (please retry)")
            if (resp){
                // Not a network issue, so report
                self._fail_report(self._error_to_debug(
                    `Request for storage failed: ${resp.status} ${resp.statusText}`))
            }
        }
    }

    dismiss(){
        // Close the dialog
        this.$emit('close')
    }

}

</script>


<style lang='sass' scoped>

.v-input
    margin-top: 24px
    margin-bottom: 12px

</style>

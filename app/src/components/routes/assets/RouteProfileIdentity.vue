
<template lang='pug'>

div
    app-text(v-model='sender_name' v-bind='$t("sender_name")')
    app-invite-html(:value='invite_tmpl_email' @input='invite_tmpl_email_input'
        :context='{sender: sender_name}')
    app-invite-text(v-if='clipboard' v-model='invite_tmpl_clipboard' :context='{sender: sender_name}')

</template>


<i18n>
en:
    sender_name:
        label: "Name"
        hint: "Name displayed in messages, notifications, and emails"
</i18n>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import AppInviteHtml from '@/components/reuseable/AppInviteHtml.vue'
import AppInviteText from '@/components/reuseable/AppInviteText.vue'
import {Profile} from '@/services/database/profiles'
import {debounce_method} from '@/services/misc'


@Component({
    components: {AppInviteHtml, AppInviteText},
})
export default class extends Vue {

    @Prop() profile:Profile
    @Prop({default: true}) clipboard:boolean  // Whether separate field for clipboard or sync both

    get sender_name(){
        return this.profile.msg_options_identity.sender_name
    }
    set sender_name(value){
        this.profile.msg_options_identity.sender_name = value
        this.save()
    }

    get invite_tmpl_email(){
        return this.profile.msg_options_identity.invite_tmpl_email
    }

    get invite_tmpl_clipboard(){
        return this.profile.msg_options_identity.invite_tmpl_clipboard
    }
    set invite_tmpl_clipboard(value){
        this.profile.msg_options_identity.invite_tmpl_clipboard = value
        this.save()
    }

    invite_tmpl_email_input(value:{html:string, text:string}){
        // NOTE app-invite-html takes string values but emits objects with both html & text
        this.profile.msg_options_identity.invite_tmpl_email = value.html

        // If no separate field for clipboard then also update it with plain text version
        if (!this.clipboard){
            this.profile.msg_options_identity.invite_tmpl_clipboard = value.text
        }

        this.save()
    }

    @debounce_method() save(){
        self._db.profiles.set(this.profile)
    }
}

</script>


<style lang='sass' scoped>

</style>

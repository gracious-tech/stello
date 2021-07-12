
<template lang='pug'>

div
    app-text(v-model='sender_name' v-bind='$t("sender_name")')
    h2(class='text-subtitle-2 mb-0 mt-8') Emailed invitation
    app-invite-html(v-model='invite_tmpl_email' :image='invite_image' :profile='profile'
        @change_image='change_image')
    template(v-if='!steps')
        h2(class='text-subtitle-2 mb-0 mt-8') Emailed reply
        app-invite-html(v-model='reply_invite_tmpl_email' :image='reply_invite_image' :profile='profile'
            @change_image='change_reply_image' reply)
        app-invite-text(v-model='invite_tmpl_clipboard' :context='{sender: sender_name}')

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
import DialogInviteImage from '@/components/dialogs/reuseable/DialogInviteImage.vue'
import {Profile} from '@/services/database/profiles'


@Component({
    components: {AppInviteHtml, AppInviteText},
})
export default class extends Vue {

    @Prop() profile:Profile
    @Prop({type: Boolean, default: false}) steps:boolean  // Whether steps setup (show less fields)

    get sender_name(){
        return this.profile.msg_options_identity.sender_name
    }
    set sender_name(value){
        this.profile.msg_options_identity.sender_name = value
        this.save()
    }

    get invite_image(){
        return this.profile.msg_options_identity.invite_image
    }
    set invite_image(value){
        this.profile.msg_options_identity.invite_image = value
        if (this.steps){
            // Also set reply image to the same, if in setup steps
            this.profile.options.reply_invite_image = value
        }
        this.save()
    }

    get reply_invite_image(){
        return this.profile.options.reply_invite_image
    }
    set reply_invite_image(value){
        this.profile.options.reply_invite_image = value
        this.save()
    }

    get invite_tmpl_email(){
        return this.profile.msg_options_identity.invite_tmpl_email
    }
    set invite_tmpl_email(value){
        this.profile.msg_options_identity.invite_tmpl_email = value
        this.save()
    }

    get reply_invite_tmpl_email(){
        return this.profile.options.reply_invite_tmpl_email
    }
    set reply_invite_tmpl_email(value){
        this.profile.options.reply_invite_tmpl_email = value
        this.save()
    }

    get invite_tmpl_clipboard(){
        return this.profile.msg_options_identity.invite_tmpl_clipboard
    }
    set invite_tmpl_clipboard(value){
        this.profile.msg_options_identity.invite_tmpl_clipboard = value
        this.save()
    }

    async change_image(){
        const blob = await this.$store.dispatch('show_dialog', {component: DialogInviteImage})
        if (blob){
            this.invite_image = blob
        }
    }

    async change_reply_image(){
        const blob = await this.$store.dispatch('show_dialog', {component: DialogInviteImage})
        if (blob){
            this.reply_invite_image = blob
        }
    }

    save(){
        self._db.profiles.set(this.profile)
    }
}

</script>


<style lang='sass' scoped>

</style>

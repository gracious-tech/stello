
<template lang='pug'>

div
    app-text(v-model='sender_name' label="Name"
        hint="Name displayed in messages, notifications, and emails")

    slot
        //- Steps component inserts username field here

    h2(class='text-subtitle-2 mb-0 mt-8') Emailed invitation
    app-invite-html(v-model='invite_tmpl_email' :image='invite_image' :profile='profile'
        @change_image='change_image')
    template(v-if='!steps')
        h2(class='text-subtitle-2 mb-0 mt-8') Emailed reply
        app-invite-html(v-model='reply_invite_tmpl_email' :image='reply_invite_image'
            :profile='profile' @change_image='change_reply_image' reply)
        app-invite-text(v-model='invite_tmpl_clipboard' :context='{sender: sender_name}')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import AppInviteHtml from '@/components/reuseable/AppInviteHtml.vue'
import AppInviteText from '@/components/reuseable/AppInviteText.vue'
import DialogImageChooser from '@/components/dialogs/reuseable/DialogImageChooser.vue'
import {Profile} from '@/services/database/profiles'
import {INVITE_HTML_MAX_WIDTH} from '@/services/misc/invites'


@Component({
    components: {AppInviteHtml, AppInviteText},
})
export default class extends Vue {

    @Prop() declare readonly profile:Profile
    @Prop({type: Boolean, default: false}) declare readonly steps:boolean  // Whether steps setup

    get sender_name(){
        return this.profile.msg_options_identity.sender_name
    }
    set sender_name(value){
        this.profile.msg_options_identity.sender_name = value
        void this.save()
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
        void this.save()
    }

    get reply_invite_image(){
        return this.profile.options.reply_invite_image
    }
    set reply_invite_image(value){
        this.profile.options.reply_invite_image = value
        void this.save()
    }

    get invite_tmpl_email(){
        return this.profile.msg_options_identity.invite_tmpl_email
    }
    set invite_tmpl_email(value){
        this.profile.msg_options_identity.invite_tmpl_email = value
        void this.save()
    }

    get reply_invite_tmpl_email(){
        return this.profile.options.reply_invite_tmpl_email
    }
    set reply_invite_tmpl_email(value){
        this.profile.options.reply_invite_tmpl_email = value
        void this.save()
    }

    get invite_tmpl_clipboard(){
        return this.profile.msg_options_identity.invite_tmpl_clipboard
    }
    set invite_tmpl_clipboard(value){
        this.profile.msg_options_identity.invite_tmpl_clipboard = value
        void this.save()
    }

    async change_image(){
        const blob = await this.$store.dispatch('show_dialog', {
            component: DialogImageChooser,
            props: {
                width: INVITE_HTML_MAX_WIDTH,
                height: INVITE_HTML_MAX_WIDTH / 3,
                invite: true,
            },
        }) as Blob
        if (blob){
            this.invite_image = blob
        }
    }

    async change_reply_image(){
        const blob = await this.$store.dispatch('show_dialog', {
            component: DialogImageChooser,
            props: {
                width: INVITE_HTML_MAX_WIDTH,
                height: INVITE_HTML_MAX_WIDTH / 3,
                invite: true,
            },
        }) as Blob
        if (blob){
            this.reply_invite_image = blob
        }
    }

    async save(){
        await self.app_db.profiles.set(this.profile)
    }
}

</script>


<style lang='sass' scoped>

</style>

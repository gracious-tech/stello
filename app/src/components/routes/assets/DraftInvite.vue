
<template lang='pug'>

div.invite(class='d-flex' :class='{"flex-column": draft_tmpl}')
    template(v-if='draft_tmpl')
        app-invite-html.custom(v-model='draft_tmpl' :button='invite_button'
            :button_default='default_button' :image='image' :profile='profile' :draft='draft'
            @change_image='change_image' @input_button='invite_button = $event')
        div(class='text-center mb-2')
            app-btn(@click='revert' small color='') Revert to default
    template(v-else)
        div.img_div(data-tip="Change invitation image" data-tip-instant)
            img(:src='image_url' @click='change_image')
        div.default(v-html='default_tmpl_preview' @click='customise_tmpl' class='flex'
            data-tip="Customise invitation" data-tip-instant)

</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import AppInviteHtml from '@/components/reuseable/AppInviteHtml.vue'
import DialogImageChooser from '@/components/dialogs/reuseable/DialogImageChooser.vue'
import {Draft} from '@/services/database/drafts'
import {Profile} from '@/services/database/profiles'
import {gen_variable_items, update_template_values} from '@/services/misc/templates'
import {INVITE_HTML_MAX_WIDTH} from '@/services/misc/invites'


@Component({
    components: {AppInviteHtml},
})
export default class extends Vue {

    @Prop({type: Draft, required: true}) declare readonly draft:Draft
    @Prop({type: Profile, required: true}) declare readonly profile:Profile

    image_url = ''

    destroyed(){
        URL.revokeObjectURL(this.image_url)
    }

    get image():Blob{
        // Get invite's image, accounting for inheritance
        const default_image = this.draft.reply_to
            ? this.profile.options.reply_invite_image
            : this.profile.msg_options_identity.invite_image
        return this.draft.options_identity.invite_image ?? default_image
    }

    get invite_button():string{
        return this.draft.options_identity.invite_button
    }
    set invite_button(value:string){
        this.draft.options_identity.invite_button = value
        this.save()
    }

    get draft_tmpl():string|null{
        // Access to draft's customised invite tmpl for email
        return this.draft.options_identity.invite_tmpl_email
    }
    set draft_tmpl(value:string|null){
        this.draft.options_identity.invite_tmpl_email = value
        this.save()
    }

    get default_tmpl():string{
        // The template that will be used if draft doesn't have own
        return this.draft.reply_to ? this.profile.options.reply_invite_tmpl_email
            : this.profile.msg_options_identity.invite_tmpl_email
    }

    get default_tmpl_preview():string{
        // Preview HTML of default template, with variables filled
        const sender_name = this.draft.options_identity.sender_name
            || this.profile.msg_options_identity.sender_name
        const max_reads = this.draft.options_security.max_reads
            ?? this.profile.msg_options_security.max_reads
        const lifespan = this.draft.options_security.lifespan
            ?? this.profile.msg_options_security.lifespan
        return update_template_values(this.default_tmpl, gen_variable_items(
            "CONTACT'S NAME", "CONTACT'S FULL NAME", sender_name, this.draft.title, new Date(),
            max_reads, lifespan,
        ))
    }

    get default_button():string{
        // The default text for the button, depending on if a reply or not
        return this.draft.reply_to ? this.profile.options.reply_invite_button
            : this.profile.msg_options_identity.invite_button
    }

    @Watch('image', {immediate: true}) watch_image(){
        URL.revokeObjectURL(this.image_url)
        this.image_url = URL.createObjectURL(this.image)
    }

    async change_image():Promise<void>{
        // Open dialog for setting a custom invite image for the draft
        // NOTE Was using DPR x2 but x1 results in 15% speed increase (both network & decrypt time)
        //      Although not much, a fast loading header image is very important for email
        //      Most delay comes from lambda starting unfortunately (~270ms cold start, ~75ms hot)
        const blob = await this.$store.dispatch('show_dialog', {
            component: DialogImageChooser,
            props: {
                width: INVITE_HTML_MAX_WIDTH,  // Only x1 DPR for speed increase
                height: INVITE_HTML_MAX_WIDTH / 3,
                // @ts-ignore -- Hack to get section data from DraftContent
                // eslint-disable-next-line
                suggestions: this.$parent.$refs['content'].get_existing_images(),
                invite: true,
                crop: true,
            },
        }) as Blob
        if (blob){
            this.draft.options_identity.invite_image = blob
            this.save()
        }
    }

    customise_tmpl(){
        // Init customisation by setting draft's tmpl as default's string (rather than null)
        this.draft_tmpl = this.default_tmpl
    }

    revert(){
        // Revert to default invitation
        this.draft_tmpl = null
    }

    save(){
        // Save changes to db
        void self.app_db.drafts.set(this.draft)
    }

}

</script>


<style lang='sass' scoped>

@import 'src/styles/utils.sass'


.invite
    // Fix colors so not affected by displayer dark mode
    @include themed(background-color, #ddd, #222)  // Slightly diff to content bg for contrast
    @include themed(color, black, white)

    ::v-deep a.button
        color: white !important


.img_div, .default
    cursor: pointer
    height: 100px

    &::after
        // Position tooltip top right corner
        top: 12px !important
        right: 12px !important


.img_div
    position: relative  // For tooltip

    img
        height: 100px


.default
    font-size: 12px
    overflow: hidden auto
    padding: 4px 12px

    ::v-deep *
        pointer-events: none  // Can only click container, not links within content etc


.custom
    margin: 24px auto 12px auto !important


</style>

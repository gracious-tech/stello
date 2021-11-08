
<template lang='pug'>

div.root(:style='container_styles')
    div.header(data-tip="Change invitation image" data-tip-instant)
        img(:src='image_src' height='0' :style='image_styles' @click='$emit("change_image")')
    app-html.input(ref='editor' :value='value' :variables='variables'
        @input='$emit("input", $event)')
    div.security(class='d-flex align-items-center justify-end')
        app-svg(name='icon_error')
        span(class='ml-1 noselect') Invitation text never expires
    div.action(v-html='action_html')

</template>


<script lang='ts'>

import {Component, Prop, Vue} from 'vue-property-decorator'

import {gen_variable_items} from '@/services/misc/templates'
import {INVITE_HTML_CONTAINER_STYLES, INVITE_HTML_IMAGE_STYLES, render_invite_html_action}
    from '@/services/misc/invites'
import {Profile} from '@/services/database/profiles'
import {Draft} from '@/services/database/drafts'


@Component({})
export default class extends Vue {

    @Prop(String) value!:string
    @Prop({type: Blob}) image!:Blob
    @Prop({type: Profile, required: true}) profile!:Profile
    @Prop({type: Draft, default: null}) draft!:Draft
    @Prop({type: Boolean, default: false}) reply!:boolean

    container_styles = INVITE_HTML_CONTAINER_STYLES
    image_styles = INVITE_HTML_IMAGE_STYLES

    get variables(){
        // Get template variables with actual and example data (where needed)
        const sender_name = this.draft?.options_identity.sender_name
            || this.profile.msg_options_identity.sender_name
        const max_reads = this.draft?.options_security.max_reads
            ?? this.profile.msg_options_security.max_reads
        const lifespan = this.draft?.options_security.lifespan
            ?? this.profile.msg_options_security.lifespan
        return gen_variable_items(null, null, sender_name, this.draft?.title, new Date(),
            max_reads, lifespan)
    }

    get image_src(){
        return URL.createObjectURL(this.image)
    }

    get action_html(){
        // Get the html needed to render the action footer
        return render_invite_html_action("", this.reply)
    }
}

</script>


<style lang='sass' scoped>

@import 'src/styles/globals.sass'


.root
    margin: 12px 0 !important
    font-size: 14px  // Actual is whatever mail client default is
    font-family: Roboto, sans-serif  // Actual is whatever mail client default is
    @include themed(color, black, white)  // Email clients will have solid text colors

.header
    cursor: pointer
    position: relative  // For sake of tooltip

    &::after
        // Position tooltip
        top: 45% !important
        left: 40% !important

.input
    padding: 24px

.security
    color: #ee4400
    text-align: right
    padding-right: 8px
    font-size: 12px
    height: 0
    position: relative
    bottom: 24px

    svg
        min-width: 20px !important
        min-height: 20px !important
        width: 20px
        height: 20px

.action
    pointer-events: none  // Don't allow clicking open button

</style>

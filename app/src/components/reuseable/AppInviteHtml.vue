
<template lang='pug'>

div.root(:style='styles.container')
    div.header(data-tip="Change invitation image" data-tip-instant)
        img(:src='image_src' height='0' :style='styles.image' @click='$emit("change_image")')
    app-html.input(ref='editor' :value='value' :variables='variables'
        @input='$emit("input", $event)')
    div.security(class='d-flex align-items-center justify-end warning--text')
        app-svg(name='icon_error')
        span(class='ml-1 noselect') Invitation text never expires
    hr(:style='styles.hr')
    div(:style='styles.action')
        input.button(ref='button' :value='button' :placeholder='button_default'
            :style='styles.button' @input='button_input')
        div(v-if='button_unchanged' class='text-caption pt-2')
            | (change button to "Latest News" or something more personal)

</template>


<script lang='ts'>

import {Component, Prop, Vue} from 'vue-property-decorator'

import {gen_variable_items} from '@/services/misc/templates'
import {gen_invite_styles} from '@/services/misc/invites'
import {Profile} from '@/services/database/profiles'
import {Draft} from '@/services/database/drafts'


@Component({})
export default class extends Vue {

    @Prop(String) declare readonly value:string
    @Prop(String) declare readonly button:string
    @Prop({type: String, default: ''}) declare readonly button_default:string
    @Prop({type: Blob}) declare readonly image:Blob
    @Prop({type: Profile, required: true}) declare readonly profile:Profile
    @Prop({type: Draft, default: null}) declare readonly draft:Draft

    mounted(){
        // Expand button-like input to fit contents when first mounted
        const element = this.$refs['button'] as HTMLInputElement
        element.style.width = `${element.scrollWidth}px`
    }

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

    get styles(){
        return gen_invite_styles(this.profile.options.theme_color.h)
    }

    get image_src(){
        return URL.createObjectURL(this.image)
    }

    get button_unchanged(){
        // Whether button is _probably_ (not exactly) still the default
        return this.button === "Open Message" ||
            (!this.button && this.button_default === "Open Message")
    }

    button_input(event:Event){
        // Emit changes to button text
        const target = event.target as HTMLInputElement
        this.$emit("input_button", target.value)

        // Autogrow width
        target.style.width = '1px'  // Needed or will never reduce
        target.style.width = `${target.scrollWidth}px`
    }
}

</script>


<style lang='sass' scoped>

@import 'src/styles/utils.sass'


.root
    margin: 12px 0 !important
    font-size: 14px  // Actual is whatever mail client default is
    font-family: sans-serif  // Actual is whatever mail client default is
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

.button
    padding-left: 12px !important  // Added via &nbsp; in actual emails
    padding-right: 12px !important  // Added via &nbsp; in actual emails
    font-weight: bold  // Added via <strong> in actual emails
    // Below added for nice UX, will actually just be exact width of text when sent
    text-align: center
    width: 140px
    min-width: 140px
    max-width: 100%

</style>


<template lang='pug'>

div.root
    div.bg
        label Notification template for emails
        //- NOTE Using v-once so not reactive since updates make cursor lose place etc
        div.input(ref='editable' v-html='value' v-once @input='html_changed')
    div.msgs {{ suggestions }}
    div.preview-label Preview
    //- Clicking disabled so can't click link in preview
    div.preview(v-html='preview' @click.prevent)


</template>


<script lang='ts'>

import {Component, Prop, Vue} from 'vue-property-decorator'

import {activate_editor} from '@/services/misc'
import {render_invite_html} from '@/services/misc/invites'


@Component({})
export default class extends Vue {

    @Prop(String) value:string
    @Prop({default: {}}) context

    placeholders = ['CONTACT', 'SENDER', 'SUBJECT']
    example_context = {
        contact: "Friend",
        sender: "Myself",
        title: "My message's subject",
        url: "",
    }
    deactivate_editor

    mounted(){
        // Activate contenteditable editor
        this.deactivate_editor = activate_editor(this.$refs.editable)
    }

    destroyed(){
        // Deactivate editor, otherwise will keep a node reference forever
        this.deactivate_editor()
    }

    get preview(){
        // A preview of template with example data
        const context = {...this.example_context, ...this.context}
        return render_invite_html(this.value, context, false)
    }

    get suggestions(){
        // Suggest placeholders that haven't been included yet
        const unused = this.placeholders.filter(ph => !this.value.includes(ph))
        if (unused.length){
            return `You can also use: ${unused.join(', ')}`
        }
        return '\xa0'  // Non-breaking space so layout doesn't shift
    }

    html_changed(event){
        // Emit both html and plain text whenever it changes
        this.$emit('input', {
            html: event.target.innerHTML,
            text: event.target.innerText,
        })
    }
}

</script>


<style lang='sass' scoped>

.root
    margin: 24px 0

.bg
    padding: 12px
    @include themed(background-color, rgba(#000, 0.08), rgba(#fff, 0.08))
    @include themed(border-color, rgba(#000, 0.5), rgba(#fff, 0.5))
    border-bottom: 1px solid
    border-radius: 4px 4px 0 0

    &:focus-within
        border-color: $accent

        label
            color: $accent

    label
        font-size: 12px

    .input
        font-size: 16px
        @include themed_color(primary)

        &:focus
            outline-style: none  // Disable webkit's default

.msgs
    font-size: 12px
    margin: 6px 12px

.preview-label
    float: right
    opacity: 0.3
    font-size: 20px
    font-weight: 500
    padding: 12px
    letter-spacing: 3px

.preview
    opacity: 0.5
    user-select: none

</style>

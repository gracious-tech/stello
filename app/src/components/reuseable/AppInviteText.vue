
<template lang='pug'>

div.root
    app-textarea(:value='value' @input='input' label="Notification template for copy/pasting"
        :hint='suggestions')
    div.preview-label Preview
    //- Clicking disabled so can't click link in preview
    div.preview(v-html='preview' @click.prevent)


</template>


<script lang='ts'>

import {Component, Prop, Vue} from 'vue-property-decorator'

import {render_invite_text} from '@/services/sending'


@Component({})
export default class extends Vue {

    @Prop(String) value:string
    @Prop({default: {}}) context

    placeholders = ['CONTACT', 'LINK', 'SENDER', 'SUBJECT']
    example_context = {
        contact: "Friend",
        sender: "Myself",
        title: "My message's subject",
        url: "https://message/abcdefghijklmnopqrstuvwxyz0123456789",
    }

    get preview(){
        // A preview of template with example data
        const context = {...this.example_context, ...this.context}
        return render_invite_text(this.value, context)
    }

    get suggestions(){
        // Suggest placeholders that haven't been included yet
        const unused = this.placeholders.filter(ph => !this.value.includes(ph))
        if (unused.length){
            return `You can also use: ${unused.join(', ')}`
        }
        return ''
    }

    input(event){
        this.$emit('input', event)
    }
}

</script>


<style lang='sass' scoped>

.root
    margin: 24px 0

.preview-label
    float: right
    opacity: 0.3
    font-size: 20px
    font-weight: 500
    padding: 12px
    letter-spacing: 3px

.preview
    border: 1px solid #8888
    white-space: pre
    padding: 12px
    opacity: 0.5
    user-select: none

</style>

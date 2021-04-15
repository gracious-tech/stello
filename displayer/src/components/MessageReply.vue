
<template lang='pug'>

//- Using form important for enabling submit button in virtual keyboards
form(v-if='allow_replies' @submit.prevent='send_reply')

    textarea(v-model='text' ref='textarea' :disabled='waiting' placeholder="Secure reply...")

    div.send
        button(type='submit' class='btn-icon' :class='{success, error: success === false}')
            Progress(v-if='waiting')
            svg(v-else viewBox='0 0 24 24')
                path(d='M2.01 21L23 12 2.01 3 2 10l15 2-15 2z')

    div.result(v-if='success !== null' :class='{success}')
        | {{ success ? "Reply has been sent" : "Could not send reply" }}

</template>


<script lang='ts'>

import {ref, watch, computed, inject, Ref} from 'vue'

import Progress from './Progress.vue'
import {displayer_config} from '../services/displayer_config'
import {respond_reply} from '../services/responses'


export default {

    components: {Progress},

    setup(){

        // Refs
        const text = ref('')
        const textarea = ref() as Ref<HTMLTextAreaElement>
        const waiting = ref(false)
        const success = ref<boolean|null>(null)

        // Injected
        const resp_token:any = inject('resp_token')

        // Computed
        const allow_replies = computed(() => displayer_config.allow_replies)

        // Watch
        watch(text, () => {
            // Reset past success value
            success.value = null
            // Auto grow textarea to fit content
            textarea.value.style.height = `${textarea.value.scrollHeight}px`
        })

        // Methods
        const send_reply = async () => {
            // Send reply

            // Ignore if already waiting on a send, or nothing to send
            if (waiting.value || !text.value.trim()){
                return
            }

            // Reset state
            success.value = null

            // Try send
            waiting.value = true
            success.value = await respond_reply(resp_token.value, text.value, null)
            waiting.value = false

            // Clear text if success
            if (success.value){
                text.value = ''
            }
        }

        // Expose
        return {textarea, text, send_reply, waiting, success, allow_replies}
    }
}

</script>


<style lang='sass' scoped>

@import '../shared/shared_mixins'

form
    width: 100%
    display: flex
    flex-direction: column
    margin-top: 36px

    textarea
        @include themed(background-color, #0001, #0006)
        border-style: none
        box-sizing: border-box
        width: 100%
        padding: 12px
        font-size: 16px
        color: inherit
        border-radius: 12px
        min-height: 100px
        max-height: 400px

        &:focus
            outline-style: none

    .send
        text-align: center
        margin: 12px 0

    .result
        display: inline-block
        align-self: center
        padding: 4px 18px
        border-radius: 10px
        background-color: rgba(red, 0.3)
        font-family: Roboto, Arial, sans-serif
        font-weight: bold
        font-size: 14px

        &.success
            background-color: rgba(green, 0.3)

</style>

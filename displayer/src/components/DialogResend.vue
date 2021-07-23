
<template lang='pug'>

h2 Request new copy of message

textarea(ref='textarea' v-model='reason')

div.actions
    button(@click='close' class='btn-text') Cancel
    button(@click='send' :disabled='!valid' class='btn-text s-primary' :class='{error, progress}')
        template(v-if='progress')
            AppProgress
        template(v-else) Send

</template>


<script lang='ts'>

import {computed, onMounted, ref, watch} from 'vue'

import {store} from '../services/store'
import {respond_resend} from '../services/responses'


export default {
    setup(){

        // Title may be available if user already opened the message before it expired
        // NOTE If message deleted, title won't be available in the app, so this could help
        // SECURITY Title can not be authenticated, so including as part of user's message only
        let title = "this message"
        if (store.state.current_msg!.title){
            title = '"' + store.state.current_msg!.title + '"'
        }

        // Placeholders
        const ph_reason = "[your reason]"
        const ph_name = "[your name]"

        // Refs
        const textarea = ref<HTMLTextAreaElement>()
        const reason = ref(''
            + `Hi, could you please send me a new copy of ${title}?`
            + `\n\nI'd like access again because ${ph_reason}\n\n${ph_name}`
        )
        const progress = ref(false)
        const error = ref(false)

        // Computed
        const valid = computed(() => reason.value && !reason.value.includes(ph_reason)
            && !reason.value.includes(ph_name))

        // Methods
        const close = () => {store.dialog_close()}
        const send = async () => {
            progress.value = true
            error.value = false
            if (await respond_resend(store.state.current_msg!.resp_token, reason.value)){
                close()
            } else {
                error.value = true
            }
            progress.value = false
        }

        // Watches
        onMounted(() => {
            watch(reason, () => {
                // Auto grow textarea to fit content
                textarea.value!.style.height = `${textarea.value!.scrollHeight}px`
            }, {immediate: true})
        })

        // Expose
        return {close, send, reason, progress, error, textarea, valid}
    }
}

</script>


<style lang='sass' scoped>

textarea
    resize: none

</style>

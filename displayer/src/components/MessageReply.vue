
<template lang='pug'>

//- Using form important for enabling submit button in virtual keyboards
form(v-if='allow_replies' @submit.prevent='send_reply' class='ui')

    div.prev(v-if='replies.length')
        strong Replied:&nbsp;
        template(v-for='(reply, i) of replies' :key='reply.getTime()')
            | {{ i === 0 ? '' : ', ' }}
            span(:title='reply.toLocaleTimeString()') {{ reply.toLocaleDateString() }}
        | &nbsp;(only author can see)
    div.last {{ last_sent_contents }}

    div.fields
        textarea(v-model='text' ref='textarea' @keyup.ctrl.enter='send_reply' :disabled='waiting'
            placeholder="Secure reply...")
        button(type='submit' class='btn-icon' :class='{error: success === false}')
            AppProgress(v-if='waiting')
            svg(v-else viewBox='0 0 24 24')
                path(d='M2.01 21L23 12 2.01 3 2 10l15 2-15 2z')
    p.note All replies/comments/reactions securely encrypted &amp; only visible to author

</template>


<script lang='ts'>

import {ref, watch, computed, Ref, defineComponent} from 'vue'

import {displayer_config} from '../services/displayer_config'
import {respond_reply} from '../services/responses'
import {database} from '../services/database'
import {store} from '../services/store'


export default defineComponent({

    setup(){

        // Refs
        const text = ref('')
        const textarea = ref() as Ref<HTMLTextAreaElement>
        const waiting = ref(false)
        const success = ref<boolean|null>(null)
        const replies = ref<Date[]>([])
        const last_sent_contents = ref<string|null>(null)

        // Static (component re-rendered for each message)
        const msg = store.state.msg!

        // Computed
        const allow_replies = computed(() => displayer_config.allow_replies)

        // Watch
        watch(text, () => {
            // Reset past success value on input (if didn't just trigger from clearing input)
            if (text.value !== ''){
                success.value = null
            }
            // Auto grow textarea to fit content
            textarea.value.style.height = `${textarea.value.scrollHeight}px`
        })

        // Methods
        const send_reply = async () => {
            // Send reply

            // Cache text so can't change while waiting for request
            const cached_text = text.value.trim()

            // Ignore if already waiting on a send, or nothing to send
            if (waiting.value || !cached_text){
                return
            }

            // Reset state
            success.value = null

            // Try send
            waiting.value = true
            success.value = await respond_reply(msg.resp_token, cached_text, null, null)
            waiting.value = false

            // Handle success
            if (success.value){
                last_sent_contents.value = cached_text
                text.value = ''
                void database.reply_add(msg.id, null, null)
                replies.value.push(new Date())
            }
        }

        // Fetch previous replies
        void database.reply_list(msg.id, null, null).then(dates => {
            replies.value = dates
        })

        // Expose
        return {textarea, text, send_reply, waiting, success, allow_replies, replies,
            last_sent_contents}
    },
})

</script>


<style lang='sass' scoped>

@import 'src/shared/styles/utils'

form
    display: flex
    flex-direction: column
    margin: 36px var(--stello-gutter)

    .prev, .last
        font-size: 14px
        margin-bottom: 6px
        padding: 0 12px

    .last
        white-space: pre-wrap
        opacity: 0.8

    textarea
        min-height: 100px
        max-height: 400px
        margin-right: 4px
        resize: none

    .fields
        display: flex
        align-items: flex-end
        margin: 12px 0

        button.error
            background-color: rgba(#f00, 0.3) !important

    .note
        font-size: 12px
        opacity: 0.6
        text-align: center
        user-select: none

</style>

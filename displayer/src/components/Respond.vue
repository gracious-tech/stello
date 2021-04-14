
<template lang='pug'>

div.bar
    button(v-if='allow_replies' @click='init_comment')
        svg(viewBox='0 0 24 24')
            path(d='M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z')
        | Comment
    button(v-if='allow_reactions' @click='init_react')
        svg(viewBox='0 0 24 24')
            path(d='M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z')
        | React

teleport(v-if='responding' to='.content')
    div.overlay(@click.self='close')

        svg.close(viewBox='0 0 24 24' @click='close')
            path(d='M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z')

        div.dialog

            div.progress(v-if='waiting')
                Progress

            div.result(v-if='success !== null' :class='{success}')
                | {{ success ? "Response has been sent" : "Could not send response" }}

            template(v-if='responding === "reacting"')
                div.reactions
                    button(@click='react_with("like")' class='btn-icon')
                        img(src='../shared/reactions/like.png' title='Like')
                    button(@click='react_with("love")' class='btn-icon')
                        img(src='../shared/reactions/love.png' title='Love')
                    button(@click='react_with("yay")' class='btn-icon')
                        img(src='../shared/reactions/yay.png' title='Yay!')
                    button(@click='react_with("pray")' class='btn-icon')
                        img(src='../shared/reactions/pray.png' title='Praying')
                div.reactions
                    button(@click='react_with("laugh")' class='btn-icon')
                        img(src='../shared/reactions/laugh.png' title='Lol')
                    button(@click='react_with("wow")' class='btn-icon')
                        img(src='../shared/reactions/wow.png' title='Wow!')
                    button(@click='react_with("sad")' class='btn-icon')
                        img(src='../shared/reactions/sad.png' title='Sad')

            //- Using form important for enabling submit button in virtual keyboards
            form(v-else @submit.prevent='send_comment')
                textarea(v-model='text' ref='textarea' placeholder="Write your comment...")
                div.send
                    button(type='submit' class='btn-icon')
                        svg(viewBox='0 0 24 24')
                            path(d='M2.01 21L23 12 2.01 3 2 10l15 2-15 2z')

            p.note Encrypted &amp; only author can see

</template>


<script lang='ts'>

import {ref, watch, computed, nextTick, inject} from 'vue'

import Progress from './Progress.vue'
import {displayer_config} from '../services/displayer_config'
import {respond_reply, respond_reaction} from '../services/responses'
import {PublishedSection} from '../shared/shared_types'


export default {

    components: {Progress},

    props: {
        section: {
            type: Object,
        },
    },

    setup(props:{section:PublishedSection}){

        // Refs
        const text = ref('')
        const responding = ref(null)
        const textarea = ref(null)
        const waiting = ref(false)
        const success = ref(null)

        // Injected
        const resp_token:any = inject('resp_token')

        // Computed
        // NOTE `respondable` didn't exist v0.3.6 and below, so may be undefined in old messages
        const allow_replies = computed(
            () => props.section.respondable !== false && displayer_config.allow_replies)
        const allow_reactions = computed(
            () => props.section.respondable !== false && displayer_config.allow_reactions)

        // Watch
        watch(text, () => {
            if (textarea.value){
                textarea.value.style.height = `${textarea.value.scrollHeight}px`
            }
        })

        // Methods
        const close = () => {

            // Prevent close if waiting for response
            if (waiting.value){
                return
            }

            // Don't preserve send result after closing
            success.value = null

            // Close
            responding.value = null
        }
        const init_comment = () => {
            responding.value = 'commenting'
            nextTick(() => {
                textarea.value.focus()
            })
        }
        const init_react = () => {
            responding.value = 'reacting'
        }
        const react_with = async type => {
            // Try send reaction
            success.value = null
            waiting.value = true
            success.value = await respond_reaction(resp_token.value, type, props.section.id)
            waiting.value = false
        }
        const send_comment = async () => {
            success.value = null

            // Don't send empty value
            if (!text.value.trim()){
                return
            }

            // Try send comment
            waiting.value = true
            success.value = await respond_reply(resp_token.value, text.value, props.section.id)
            waiting.value = false

            // Reset if success (but don't close so can see result)
            if (success.value){
                text.value = ''
            }
        }

        // Expose
        return {responding, init_comment, init_react, close, react_with, textarea, text,
            send_comment, waiting, success, allow_replies, allow_reactions}
    }
}

</script>


<style lang='sass' scoped>

@import '../styles_mixins'


.bar
    display: flex
    justify-content: space-around
    opacity: 0.5
    margin: 12px 0

    &:hover
        opacity: 1

    button
        display: inline-flex
        align-items: center
        background-color: transparent
        border-style: none
        font-weight: bold
        cursor: pointer
        padding: 6px 12px
        border-radius: 6px
        opacity: 0.5

        &:hover
            opacity: 0.8
            @include themed(background-color, #0002, #fff2)

        svg
            width: 24px
            height: 24px
            margin-right: 12px

            path
                fill: currentColor


.overlay
    position: fixed
    top: 0
    bottom: 0
    left: 0
    right: 0
    display: flex
    flex-direction: column
    align-items: center
    background-color: #000d  // Always dark
    z-index: 100

    .close
        width: 48px
        height: 48px
        margin: 24px
        align-self: flex-end
        cursor: pointer
        opacity: 0.25
        position: absolute

        &:hover
            opacity: 0.5

        path
            fill: white  // Always on dark overlay


    .dialog
        margin: auto
        display: flex
        flex-direction: column
        align-items: center
        @include themed(background-color, #fff, #222)
        border-radius: 12px
        padding: 18px
        max-width: 600px
        width: 80%
        max-height: 80%

        .progress
            margin-bottom: 24px

        .result
            padding: 6px 24px
            margin-bottom: 24px
            border-radius: 12px
            background-color: rgba(red, 0.3)
            font-family: Roboto, sans-serif
            font-weight: bold
            font-size: 14px

            &.success
                background-color: rgba(green, 0.3)

        .note
            font-size: 12px
            font-family: Roboto, sans-serif
            user-select: none
            opacity: 0.6

        .reactions
            user-select: none

            button
                border-radius: 30px

                img
                    width: 36px
                    height: 36px

        form
            width: 100%
            display: flex
            flex-direction: column

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


</style>

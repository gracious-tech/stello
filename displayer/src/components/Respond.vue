
<template lang='pug'>

div.respondbar
    SharedRespondReply(v-if='allow_replies' @click='init_comment')
    SharedRespondReact(v-if='allow_reactions' @click='init_react' :class='{responded: chosen_reaction}')
        ReactionSvg(v-if='chosen_reaction' :reaction='chosen_reaction')

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
                    button(v-for='reaction of reaction_options' @click='react_with(reaction)')
                        ReactionSvg(:reaction='reaction' :chosen='reaction === chosen_reaction')

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

import {ref, watch, computed, nextTick, inject, PropType, Ref} from 'vue'

import Progress from './Progress.vue'
import ReactionSvg from './ReactionSvg.vue'
import SharedSvgAnimated from '../shared/SharedSvgAnimated.vue'
import SharedRespondReact from '../shared/SharedRespondReact.vue'
import SharedRespondReply from '../shared/SharedRespondReply.vue'
import {displayer_config} from '../services/displayer_config'
import {respond_reply, respond_reaction} from '../services/responses'
import {PublishedSection} from '../shared/shared_types'
import {database} from '../services/database'


export default {

    components: {Progress, SharedRespondReact, SharedRespondReply, SharedSvgAnimated, ReactionSvg},

    props: {
        section: {
            type: Object as PropType<PublishedSection>,
            required: true,
        },
        subsection: {
            type: String as PropType<string|null>,
            default: null,  // So that typing knows it is never undefined
        },
    },

    setup(props){

        // Refs
        const text = ref('')
        const responding = ref<'commenting'|'reacting'|null>(null)
        const textarea = ref() as Ref<HTMLTextAreaElement>
        const waiting = ref(false)
        const success = ref<boolean|null>(null)
        const chosen_reaction = ref<string|null>(null)

        // Injected
        const msg_id:string = inject('msg_id') as string
        const resp_token:any = inject('resp_token')

        // Computed
        // NOTE `respondable` didn't exist v0.3.6 and below, so may be undefined in old messages
        const allow_replies = computed(
            () => props.section.respondable !== false && displayer_config.allow_replies)
        const allow_reactions = computed(
            () => props.section.respondable !== false && displayer_config.allow_reactions)
        const reaction_options = computed(() => displayer_config.reaction_options)
        const subsect_id = computed(() => props.subsection ?? props.section.id)

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
        const react_with = async (type:string|null) => {
            // Try send reaction

            // Reset success/waiting state
            success.value = null
            waiting.value = true

            // If setting to same value as have already, then is disabling rather than setting
            if (type === chosen_reaction.value){
                type = null
            }

            // Preserve old value so can return state to it if request fails
            const old_value = chosen_reaction.value

            // Update state now as user shouldn't need to bother themselves with request progress
            chosen_reaction.value = type

            // Submit request
            success.value = await respond_reaction(resp_token.value, type, props.section.id,
                props.subsection)

            // Deal with result
            if (success.value){
                // Request successful so can update db
                if (type === null){
                    database.reaction_remove(subsect_id.value)
                } else {
                    database.reaction_set(msg_id, props.section.id, props.subsection, type)
                }
            } else {
                // Request failed so revert state to old value
                chosen_reaction.value = old_value
            }

            // Clear waiting
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
            success.value = await respond_reply(resp_token.value, text.value, props.section.id,
                props.subsection)
            waiting.value = false

            // Reset if success (but don't close so can see result)
            if (success.value){
                text.value = ''
            }
        }

        // Keep state up-to-date with db
        watch(subsect_id, async value => {
            chosen_reaction.value = await database.reaction_get(value)
        }, {immediate: true})

        // Expose
        return {
            responding, init_comment, init_react, close, react_with, textarea, text,
            send_comment, waiting, success, allow_replies, allow_reactions, reaction_options,
            chosen_reaction,
        }
    }
}

</script>


<style lang='sass' scoped>

@import '../shared/shared_mixins'


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
        @include stello_themed(background-color, #fff, #222)
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
            text-align: center

            button
                border-style: none
                background-color: transparent
                cursor: pointer

                :deep(svg)
                    width: 64px !important
                    height: 64px !important

        form
            width: 100%
            display: flex
            flex-direction: column

            textarea
                @include stello_themed(background-color, #0001, #0006)
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

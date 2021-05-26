
<template lang='pug'>

div.respondbar(@mouseenter='have_hovered = true')

    div.reply_container(v-if='allow_replies')
        SharedRespondReply(@click='focus_textarea' :replied='!!replies.length'
            :class='{responded: !!replies.length}')
        div.position(v-if='have_hovered')
            //- Using form important for enabling submit button in virtual keyboards
            form.popup(@submit.prevent='send_comment')
                div.prev(v-if='replies.length')
                    strong Commented:&nbsp;
                    template(v-for='(reply, i) of replies')
                        | {{ i === 0 ? '' : ', ' }}
                        span(:title='reply.toLocaleTimeString()') {{ reply.toLocaleDateString() }}
                div.last(v-if='last_sent_contents') {{ last_sent_contents }}
                div.fields
                    textarea(v-model='reply_text' ref='reply_textarea' :disabled='reply_waiting'
                        @keyup.ctrl.enter='send_comment' placeholder="Private & secure")
                    button(type='submit' class='btn-icon' :class='{error: reply_success === false}')
                        Progress(v-if='reply_waiting')
                        svg(v-else viewBox='0 0 24 24')
                            path(d='M2.01 21L23 12 2.01 3 2 10l15 2-15 2z')

    div.react_container(v-if='allow_reactions' ref='react_container')
        //- WARN Safari doesn't give focus to buttons automatically so must do manually
        SharedRespondReact(@click='$event => $event.target.focus()'
                :class='{responded: chosen_reaction}')
            ReactionSvg(v-if='chosen_reaction' :reaction='chosen_reaction')
        div.position(v-if='have_hovered')
            div.popup
                div.reactions
                    //- WARN iOS blurs before click event which prevents it (mousedown before blur)
                    button(v-for='reaction of reaction_options' @mousedown='react_with(reaction)')
                        ReactionSvg.reaction(:reaction='reaction'
                            :chosen='reaction === chosen_reaction' :playing='react_popup_visible')
                p.note Private &amp; secure


</template>


<script lang='ts'>

import {ref, watch, computed, inject, PropType, Ref, onMounted, reactive} from 'vue'

import Progress from './Progress.vue'
import ReactionSvg from './ReactionSvg.vue'
import SharedRespondReact from '../shared/SharedRespondReact.vue'
import SharedRespondReply from '../shared/SharedRespondReply.vue'
import {displayer_config} from '../services/displayer_config'
import {respond_reply, respond_reaction} from '../services/responses'
import {PublishedSection} from '../shared/shared_types'
import {database} from '../services/database'


export default {

    components: {Progress, SharedRespondReact, SharedRespondReply, ReactionSvg},

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

        // Generic
        const msg_id:string = inject('msg_id') as string
        const resp_token:any = inject('resp_token')
        const have_hovered = ref(false)  // Don't create popup DOM until needed
        const subsect_id = computed(() => props.subsection ?? props.section.id)


        // REPLIES

        const reply_text = ref('')
        const reply_textarea = ref() as Ref<HTMLTextAreaElement>
        const reply_waiting = ref(false)
        const reply_success = ref<boolean|null>(null)
        const replies = ref<Date[]>([])
        const last_sent_cache = reactive<Record<string, string>>({})

        const last_sent_contents = computed(() => last_sent_cache[props.subsection ?? 'null'])

        // NOTE `respondable` didn't exist v0.3.6 and below, so may be undefined in old messages
        const allow_replies = computed(
            () => props.section.respondable !== false && displayer_config.allow_replies)

        const focus_textarea = () => {
            // Focus textarea for quicker writing
            // NOTE iOS won't focus until textarea displayed, so requires two clicks
            reply_textarea.value.focus()
        }

        const send_comment = async () => {

            // Cache current values so that can't change while waiting for request
            const section = props.section.id
            const subsection = props.subsection
            const text = reply_text.value.trim()

            // Don't send empty value and don't continue if already waiting on request
            if (!text || reply_waiting.value){
                return
            }

            // Try send comment
            reply_success.value = null
            reply_waiting.value = true
            reply_success.value = await respond_reply(resp_token.value, text, section, subsection)
            reply_waiting.value = false

            // Handle success
            if (reply_success.value){

                // Preserve last sent contents only in tmp state
                last_sent_cache[subsection ?? 'null'] = text
                reply_text.value = ''

                // Record in db
                replies.value.push(new Date())
                database.reply_add(msg_id, section, subsection)

                // Blur focus so popup disappears (if not hovered)
                // @ts-ignore blur is a valid method
                self.document.activeElement?.blur()
            }
        }

        watch(reply_text, () => {
            // Make textarea grow with content
            if (reply_textarea.value){
                reply_textarea.value.style.height = `${reply_textarea.value.scrollHeight}px`
            }
        })

        watch(props, async () => {
            // Get reply dates from db
            replies.value = await database.reply_list(msg_id, props.section.id, props.subsection)
        }, {immediate: true})


        // REACTIONS

        const chosen_reaction = ref<string|null>(null)
        const react_container = ref() as Ref<HTMLDivElement>
        const react_popup_visible = ref(false)

        const allow_reactions = computed(
            () => props.section.respondable !== false && displayer_config.allow_reactions)
        const reaction_options = computed(() => displayer_config.reaction_options)

        const react_with = async (type:string|null) => {
            // Try send reaction

            // Prevent popup from staying open due to gaining focus
            // @ts-ignore blur is a valid method
            self.document.activeElement?.blur()

            // If setting to same value as have already, then is disabling rather than setting
            if (type === chosen_reaction.value){
                type = null
            }

            // Preserve old value so can return state to it if request fails
            const old_value = chosen_reaction.value

            // Update state now as user shouldn't need to bother themselves with request progress
            chosen_reaction.value = type

            // Submit request
            const result = await respond_reaction(resp_token.value, type, props.section.id,
                props.subsection)

            // Deal with result
            if (result){
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

        }

        onMounted(() => {
            // Stop animations when popup hidden to reduce CPU usage
            // Safer than using JS to show popup as CSS reliable and worst case animations paused
            // NOTE If reactions disabled for a section then `react_container` won't exist
            if (react_container.value){
                react_container.value.addEventListener('mouseenter', () => {
                    react_popup_visible.value = true
                })
                react_container.value.addEventListener('mouseleave', () => {
                    react_popup_visible.value = false
                })
            }
        })

        watch(subsect_id, async value => {
            // Get last reaction from db
            chosen_reaction.value = await database.reaction_get(value)
        }, {immediate: true})


        // Expose
        return {
            allow_replies, allow_reactions, have_hovered,
            focus_textarea, reply_textarea, reply_text, reply_waiting, reply_success, send_comment,
            react_with, reaction_options, chosen_reaction, react_container, react_popup_visible,
            last_sent_contents, replies,
        }
    }
}

</script>


<style lang='sass' scoped>

@import '../shared/shared_mixins'


.reply_container, .react_container
    font-family: Roboto, sans-serif

    .position
        display: none
        position: absolute
        z-index: 10

    .popup
        @include stello_themed(background-color, #fff, #222)
        box-shadow: 0 2px 6px 0 rgba(#000, 0.1)
        border-radius: 12px

    .note
        user-select: none
        text-align: center
        font-size: 12px
        opacity: 0.6


.reply_container

    // Always want to show when focused, whether cursor or touch
    // NOTE Hover on touch also important for keeping open when clicking bg of popup
    // WARN iOS behaviour is painful and seemingly unsolveable
    //      One element can be "hovered" while a different one is "focused"
    //      Clicking reply after react requires two clicks
    //      But don't want to remove hover as finishing writing in textarea triggers blur and hide
    &:focus, &:focus-within, &:hover
        .position
            display: flex

    button.respond
        &.responded :deep(path)
            fill: rgba(#696, 1)

    .position
        left: 0
        right: 0

    .popup
        display: flex
        flex-direction: column
        align-items: center
        padding: 8px
        width: 100%
        max-height: 80%

        .prev, .last
            font-size: 13px
            max-width: 100%  // Prevent long words breaking layout
            padding: 0 12px
            margin-bottom: 6px

        .last
            white-space: pre-wrap

        .fields
            width: 100%
            display: flex
            align-items: flex-end

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
            margin-right: 6px

            &:focus
                outline-style: none

        button.error
                background-color: rgba(#f00, 0.3)


.react_container

    @media (hover: hover)
        // Should only show if hovering when have cursor
        &:hover
            .position
                display: flex
    @media not all and (hover: hover)
        // Should not show on hover if touch, as then can't blur after clicking choice
        &:focus, &:focus-within
            .position
                display: flex

    .position
        right: 0

    .reactions
        display: flex
        flex-wrap: wrap
        justify-content: center

        button
            display: inline-flex
            padding: 0
            border-style: none
            background-color: transparent
            cursor: pointer

            .reaction
                display: flex
                justify-content: center
                align-items: center
                // Make reaction div slighter larger than reaction to pad and make room for growing
                width: 52px
                height: 52px

                :deep(svg)
                    display: flex
                    width: 48px !important
                    height: 48px !important
                    transition: all 0.1s

                // On devices with cursors make buttons larger and grow to fill when hovered
                @media (hover: hover)
                    width: 64px
                    height: 64px

                    :deep(svg:hover)
                        width: 64px !important
                        height: 64px !important

</style>

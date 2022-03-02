
<template lang='pug'>

transition(appear)
    div.overlay(v-if='page' @click.self='close')
        transition(:name='transition' mode='out-in')
            div.container(:key='page.id')
                div.toolbar(class='ui')
                    svg(@click='back' viewBox='0 0 24 24')
                        path(d='M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z')
                    h2 {{ page.content.headline }}
                div.content
                    MessageContents(:sections='page.content.sections')

</template>


<script lang='ts'>

import {watch, inject, defineComponent, Ref, ref} from 'vue'

import MessageContents from '@/components/MessageContents.vue'
import {PublishedContentPage, PublishedSection} from '@/shared/shared_types'


export default defineComponent({

    components: {MessageContents},

    setup(){

        // Inject page
        const page = inject('page') as Ref<PublishedSection<PublishedContentPage>|null>
        const parents:PublishedSection<PublishedContentPage>[] = []
        const transition = ref<'in'|'out'>('in')

        // Changing page methods
        const close = () => {
            page.value = null
        }
        const back = () => {
            page.value = parents.slice(-1)[0] ?? null
        }

        // React to page changes
        watch(page, (value, old_value) => {

            // Prevent page scroll while page is open
            (self.document.body.parentNode as HTMLElement).style.overflowY =
                value ? "hidden" : "auto"

            // Keep parents array updated
            if (value === null){
                // Returning to main message
                parents.splice(0, parents.length)  // Clear parents in case returning from deep in
            } else if (value === parents.slice(-1)[0]){
                // Going back to parent page
                parents.pop()
                transition.value = 'out'
            } else {
                // Going deeper
                if (old_value !== null){
                    parents.push(old_value)  // Prev was a page and not main message
                }
                transition.value = 'in'
            }
        })

        // Expose
        return {close, page, back, transition}
    },
})

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
    background-color: #000d  // Always dark
    z-index: 100

    // Fade in when open first page
    &.v-enter-active, &.v-leave-active
        transition: opacity 300ms ease
    &.v-enter-from, &.v-leave-to
        opacity: 0

    .container
        width: 100%
        overflow: hidden
        display: flex
        flex-direction: column
        @include stello_themed(background-color, #fff, #222)

        // Appear like a dialog when screen wide
        @media (min-width: 900px)
            margin: 48px auto
            max-width: 800px
            border-radius: 12px

            .toolbar
                border-radius: 12px 12px 0 0

        .toolbar
                display: flex
                align-items: center
                background-color: rgba(#777, 0.3)
                width: 100%

                svg
                    width: 36px
                    min-width: 36px  // So text doesn't squish
                    padding: 6px
                    border-radius: 24px
                    margin: 8px 12px
                    cursor: pointer
                    path
                        fill: currentColor
                    &:hover
                        background-color: rgba(#777, 0.5)

                h2
                    margin: 0
                    margin-right: 24px  // So don't show overflow against edge
                    white-space: nowrap
                    overflow: hidden

        // NOTE .content inherits same styles as main message .content does
        .content
            margin: 0
            overflow-y: auto
            max-width: none  // Enforced by container instead so scrollbar touches screen edge



// Transitions between pages

@keyframes slide-left-enter
    from
        transform: translateX(100%)
    to
        transform: translateX(0)

@keyframes slide-left-leave
    from
        transform: translateX(0)
    to
        transform: translateX(-100%)

@keyframes slide-right-enter
    from
        transform: translateX(-100%)
    to
        transform: translateX(0)

@keyframes slide-right-leave
    from
        transform: translateX(0)
    to
        transform: translateX(100%)


.container
    animation-duration: 200ms
    animation-timing-function: linear

    &.out-enter-active
        animation-name: slide-right-enter

    &.out-leave-active
        animation-name: slide-right-leave

    &.in-enter-active
        animation-name: slide-left-enter

    &.in-leave-active
        animation-name: slide-left-leave


</style>

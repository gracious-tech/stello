
<template lang='pug'>

transition(appear)
    div.overlay(v-if='page' @click.self='close')
        div.toolbar
            div.toolbar-inner
                svg(@click='back' viewBox='0 0 24 24')
                    path(d='M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z')
                h2(class='ui') {{ page.content.headline }}
        transition(:name='transition' mode='out-in')
            div.container(:key='page.id')
                div.content
                    MessageContents(:sections='page.content.sections')

</template>


<script lang='ts'>

import {watch, computed, defineComponent, ref, DeepReadonly} from 'vue'

import MessageContents from '@/components/MessageContents.vue'
import {PublishedContentPage, PublishedSection} from '@/shared/shared_types'
import {store} from '@/services/store'


export default defineComponent({

    components: {MessageContents},

    setup(){

        const page = computed(() => store.state.msg!.page)
        const parents:DeepReadonly<PublishedSection<PublishedContentPage>>[] = []
        const transition = ref<'in'|'out'>('in')

        // Changing page methods
        const close = () => {
            store.change_page(null)
        }
        const back = () => {
            const prev_page = parents.slice(-1)[0]
            if (!prev_page){
                close()
            } else {
                // NOTE Must type cask to avoid warnings about readonly
                store.change_page(prev_page as PublishedSection<PublishedContentPage>)
            }
        }

        // React to page changes
        watch(page, (value, old_value) => {

            // Prevent page scroll while page is open
            // NOTE Applying on <html> doesn't work for Safari
            self.document.body.style.overflowY = value ? "hidden" : "auto"

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

@import 'src/shared/styles/utils'


.overlay
    position: fixed
    top: 0
    bottom: 0
    left: 0
    right: 0
    display: flex
    flex-direction: column
    z-index: 100

    // Background must go here so doesn't transition with pages
    background-color: var(--stello-bg)
    background-image: var(--stello-bg-image)
    background-repeat: repeat
    background-attachment: local  // Bg moves the same as content does

    // Fade in when open first page
    &.v-enter-active, &.v-leave-active
        transition: opacity 300ms ease
    &.v-enter-from, &.v-leave-to
        opacity: 0

    .toolbar
        background-color: var(--stello-hue-heavy)
        flex-shrink: 0  // Prevent toolbar getting squished on old Safari

        .toolbar-inner
            display: flex
            align-items: center
            width: 100%
            max-width: $stello_full_plus_sidebar
            margin: 0 auto

            svg
                width: 24px
                min-width: 24px  // So text doesn't squish
                padding: 12px
                border-radius: 50%
                margin: 0 12px
                cursor: pointer
                path
                    fill: currentColor
                &:hover
                    background-color: rgba(#000, 0.2)

                @media (min-width: $stello_full_plus_sidebar)
                    margin: 8px 12px  // Taller toolbar when not on mobile

            h2
                font-size: 18px
                margin: 0
                margin-right: 24px  // So don't show overflow against edge
                white-space: nowrap
                overflow: hidden
                text-overflow: ellipsis

    .container
        width: 100%
        height: 100%
        overflow: auto
        margin: 0 auto
        @media (min-width: $stello_full_plus_sidebar)
            padding-bottom: 100px

        // NOTE .content inherits same styles as main message .content does
        .content
            // pass


// Transitions between pages

@keyframes slide-left-enter
    from
        transform: translateX(25%)
        opacity: 0
    to
        transform: translateX(0)

@keyframes slide-left-leave
    from
        transform: translateX(0)
    to
        transform: translateX(-25%)
        opacity: 0

@keyframes slide-right-enter
    from
        transform: translateX(-25%)
        opacity: 0
    to
        transform: translateX(0)

@keyframes slide-right-leave
    from
        transform: translateX(0)
    to
        transform: translateX(25%)
        opacity: 0


.container
    animation-duration: 200ms
    animation-timing-function: linear

    &.out-enter-active
        animation-name: slide-right-enter
        overflow: hidden

    &.out-leave-active
        animation-name: slide-right-leave
        overflow: hidden

    &.in-enter-active
        animation-name: slide-left-enter
        overflow: hidden

    &.in-leave-active
        animation-name: slide-left-leave
        overflow: hidden


</style>

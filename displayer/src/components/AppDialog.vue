
<template lang='pug'>

div.overlay(v-if='dialog' @click.self='overlay_close' class='ui')
    div.dialog
        component(:is='dialog.component' v-bind='dialog.props')

</template>


<script lang='ts'>

import {computed, watch, defineComponent} from 'vue'

import {store} from '../services/store'


export default defineComponent({
    setup(){
        const dialog = computed(() => store.state.dialog)
        const overlay_close = () => {
            if (!dialog.value?.persistent){
                store.dialog_close()
            }
        }
        watch(dialog, value => {
            // Prevent page scroll while dialog is open
            // NOTE Applying on <html> doesn't work for Safari
            self.document.body.style.overflowY = value ? 'hidden' : 'auto'
        })

        return {dialog, overlay_close}
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
    align-items: center
    background-color: #000d  // Always dark
    z-index: 100

    .dialog
        margin: auto
        display: flex
        flex-direction: column
        align-items: center
        @include stello_themed(color, rgba(#000, 0.8), rgba(#fff, 0.8))
        @include stello_themed(background-color, #fff, #222)
        border-radius: var(--stello-radius)
        padding: 18px
        max-width: 600px
        width: 80%
        max-height: 80%
        overflow: hidden auto
        box-sizing: border-box

        @media (max-width: 600px)
            max-width: none
            max-height: none
            width: 100%
            flex-grow: 1
            border-radius: 0

        ::v-deep(.actions)
            align-self: flex-end
            display: flex
            margin-top: 18px

            button
                margin-left: 12px
                min-width: 90px
                justify-content: center

                &:first-child
                    margin-left: 0

                &.error
                    background-color: rgba(#f00, 0.3) !important

                &.progress
                    padding: 6px

                svg  // AppProgress
                    width: 20px
                    height: 20px

                    circle
                        stroke: currentColor !important


</style>

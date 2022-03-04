
<template lang='pug'>

div.overlay(v-if='dialog' @click.self='close' class='ui')
    div.dialog
        component(:is='dialog.component' v-bind='dialog.props')

</template>


<script lang='ts'>

import {computed, watch, defineComponent} from 'vue'

import {store} from '../services/store'


export default defineComponent({
    setup(){
        const dialog = computed(() => store.state.dialog)
        const close = () => {store.dialog_close()}
        watch(dialog, value => {
            // Prevent page scroll while dialog is open
            ;(self.document.body.parentNode as HTMLElement).style.overflowY =
                value ? 'hidden' : 'auto'
        })

        return {dialog, close}
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
    flex-direction: column
    align-items: center
    background-color: #000d  // Always dark
    z-index: 100

    .dialog
        margin: auto
        display: flex
        flex-direction: column
        align-items: center
        @include stello_themed(background-color, #fff, #222)
        border-radius: var(--stello-radius)
        padding: 18px
        max-width: 600px
        width: 80%
        max-height: 80%

        ::v-deep(.actions)
            align-self: flex-end
            display: flex
            margin-top: 18px

            button
                margin-left: 12px
                min-width: 90px
                justify-content: center

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

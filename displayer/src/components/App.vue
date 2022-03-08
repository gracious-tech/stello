
<template lang='pug'>

//- NOTE tabindex makes app container focusable (-1 so only for JS use)
//-      VERY important for iOS, otherwise clicking outside of response popup does not defocus popup
div.stello-displayer(:class='classes' :style='theme_style_props' tabindex='-1')

    //- NOTE AppUnsubscribed Also used to show when account disabled
    AppUnsubscribed

    SharedDarkToggle(:value='dark' @input='toggle_dark')

    //- Don't insert new node until old gone (out-in) to avoid scrolling issues
    transition(v-if='msg' :name='transition' mode='out-in')
        div.content(:key='msg.id')
            AppMessage

    //- This will only be shown if no hash and no history in db
    //- e.g. Manually copied URL without hash, or refreshed browser that has no idb access
    h1.no_msg(v-else) Click original link to view message

    AppHistory

    AppFooter

    AppDialog

</template>


<script lang='ts'>

import {computed, watch, onMounted, nextTick, defineComponent} from 'vue'

import AppMessage from './AppMessage.vue'
import AppHistory from './AppHistory.vue'
import AppFooter from './AppFooter.vue'
import AppUnsubscribed from './AppUnsubscribed.vue'
import AppDialog from './AppDialog.vue'
import SharedDarkToggle from '../shared/SharedDarkToggle.vue'
import {store} from '../services/store'
import {displayer_config} from '@/services/displayer_config'
import {gen_theme_style_props} from '@/shared/shared_theme'


export default defineComponent({

    components: {AppMessage, SharedDarkToggle, AppDialog, AppUnsubscribed, AppHistory, AppFooter},

    setup(){

        // Reactive access to store props
        const transition = computed(() => store.state.transition)
        const dark = computed(() => store.state.dict.dark)

        // When can access DOM, keep background of root element up-to-date with container bg
        onMounted(() => {
            watch(dark, async () => {
                await nextTick()  // Wait for container style to change before knowing new value
                const container = self.document.querySelector('.stello-displayer')!
                const styles = self.getComputedStyle(container)
                self.document.documentElement.style.backgroundColor = styles.backgroundColor
                self.document.documentElement.style.backgroundImage = styles.backgroundImage
            }, {immediate: true})
        })

        return {
            transition,
            dark,
            toggle_dark: () => {
                store.toggle_dark()
            },
            msg: computed(() => store.state.msg),
            classes: computed(() => {
                // NOTE Can't use `dark` computed prop within another computed prop (non-reactive)
                return {
                    dark: store.state.dict.dark,
                    [`style-${displayer_config.theme_style as string}`]: true,
                }
            }),
            theme_style_props: computed(() => gen_theme_style_props(store.state.dict.dark,
                displayer_config.theme_style, displayer_config.theme_color)),
        }
    },
})

</script>


<style lang='sass' scoped>


.no_msg
    text-align: center
    margin: 100px 48px !important


// Prev/next transition animations


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


.content
    animation-duration: 200ms
    animation-timing-function: linear

    &.prev-enter-active
        animation-name: slide-right-enter

    &.prev-leave-active
        animation-name: slide-right-leave

    &.next-enter-active
        animation-name: slide-left-enter

    &.next-leave-active
        animation-name: slide-left-leave


</style>

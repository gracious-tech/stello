
<template lang='pug'>

//- NOTE tabindex makes app container focusable (-1 so only for JS use)
//-      VERY important for iOS, otherwise clicking outside of response popup does not defocus popup
div(class='stello-displayer' :class='{dark}' tabindex='-1')

    SharedDarkToggle(:value='dark' @input='toggle_dark')

    div(class='content')
        //- Don't insert new node until old gone (out-in) to avoid scrolling issues
        transition(:name='transition' mode='out-in')
            Message.msg(v-if='current_msg' :key='current_msg.id')
        p.no_msg(v-if='!current_msg') No messages available

        AppUnsubscribe(v-if='show_unsubscribe')

</template>


<script lang='ts'>

import {computed, watch, onMounted, nextTick} from 'vue'

import Message from './components/Message.vue'
import SharedDarkToggle from './shared/SharedDarkToggle.vue'
import AppUnsubscribe from './components/AppUnsubscribe.vue'
import {store} from './services/store'


export default {

    components: {Message, AppUnsubscribe, SharedDarkToggle},

    setup(){

        // Reactive access to store props
        const transition = computed(() => store.state.transition)
        const dark = computed(() => store.state.dict.dark)

        // When can access DOM, keep background of root element up-to-date with container bg
        onMounted(() => {
            watch(dark, async () => {
                await nextTick()  // Wait for container style to change before knowing new value
                const container = self.document.querySelector('.stello-displayer')!
                const bg = self.getComputedStyle(container).backgroundColor
                self.document.documentElement.style.backgroundColor = bg
            }, {immediate: true})
        })

        return {
            transition,
            dark,
            toggle_dark: () => {
                store.toggle_dark()
            },
            current_msg: computed(() => store.state.current_msg),
            show_unsubscribe: computed(() => store.state.show_unsubscribe)
        }
    },
}

</script>


<style lang='sass' scoped>



.stello-displayer
    outline-style: none  // Outline may appear due to tabindex attr

    .content
        // Show narrower gutters for displayer since don't need space for menus
        padding-left: 24px
        padding-right: 24px
        padding-top: 48px * 2  // Match editor, accounting for missing addbar


.no_msg
    text-align: center


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


.msg
    animation-duration: 375ms
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


<template lang='pug'>

//- NOTE tabindex makes app container focusable (-1 so only for JS use)
//-      VERY important for iOS, otherwise clicking outside of response popup does not defocus popup
div(class='stello-displayer' :class='{dark}' tabindex='-1')

    SharedDarkToggle(:value='dark' @input='toggle_dark')

    div(class='content')
        Message(v-if='current_msg' :msg_access='current_msg')
        p.no_msg(v-else) No messages available

    Unsubscribe(v-if='show_unsubscribe')

</template>


<script lang='ts'>

import {computed, watch, onMounted, nextTick} from 'vue'

import Message from './components/Message.vue'
import SharedDarkToggle from './shared/SharedDarkToggle.vue'
import Unsubscribe from './components/Unsubscribe.vue'
import {store} from './services/store'


export default {

    components: {Message, Unsubscribe, SharedDarkToggle},

    setup(){

        // Reactive access to dark
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

.stello-displayer .content
    // Show narrower gutters for displayer since don't need space for menus
    padding-left: 24px
    padding-right: 24px
    padding-top: 48px * 2  // Match editor, accounting for missing addbar

.no_msg
    text-align: center

</style>

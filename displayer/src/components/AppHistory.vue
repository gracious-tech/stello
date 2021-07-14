
<template lang='pug'>

div.history
    div.prev(v-if='prev')
        a(@click='prev.load') ← {{ prev.label }}
        span Previous
    | &nbsp;
    div.next(v-if='next')
        a(@click='next.load') {{ next.label }} →
        span Next

</template>


<script lang='ts'>

import {computed} from 'vue'

import {store} from '../services/store'


export default {
    setup(){

        // Reactive access to index of current message in history
        const current = computed(() => {
            const i = store.state.history.findIndex(item => item.id === store.state.current_msg?.id)
            return i === -1 ? null : i
        })

        // Data needed for prev/next buttons
        const prev = computed(() => {
            // Prev is either current-1 or last item if current message not valid/in-history
            const prev_i = (current.value ?? store.state.history.length) - 1
            if (prev_i < 0){
                return null  // Currently showing first message (or no history at all)
            }
            const item = store._state.history[prev_i]
            return {
                label: item.title,
                load: () => {
                    store.change_transition('prev')
                    store.change_current_msg(item.id, item.secret, item.title, item.published)
                },
            }
        })
        const next = computed(() => {
            // Next is only shown if current item is in history and not last item
            if (current.value === null || current.value >= store.state.history.length - 1){
                return null
            }
            const item = store._state.history[current.value + 1]
            return {
                label: item.title,
                load: () => {
                    store.change_transition('next')
                    store.change_current_msg(item.id, item.secret, item.title, item.published)
                },
            }
        })

        // Expose
        return {prev, next}
    }
}

</script>


<style lang='sass' scoped>

.history
    display: flex
    justify-content: space-between
    font-family: Roboto, sans-serif

    .prev, .next
        display: flex
        flex-direction: column

        span
            opacity: 0.8
            font-size: 0.8em

        a
            cursor: pointer

    .prev
        align-items: flex-start

    .next
        align-items: flex-end

</style>

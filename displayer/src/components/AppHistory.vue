
<template lang='pug'>

template(v-if='prev || next')
    h2.title(class='ui') Other Messages

    div.history(class='ui')
        div.prev(v-if='prev')
            a(@click='prev.load') ← {{ prev.label }}
            span {{ prev.date }}
        | &nbsp;
        div.next(v-if='next')
            a(@click='next.load') {{ next.label }} →
            span {{ next.date }}

</template>


<script lang='ts'>

import {computed, defineComponent} from 'vue'

import {store} from '../services/store'


export default defineComponent({
    setup(){

        // Reactive access to index of current message in history
        const current = computed(() => {
            const i = store.state.history.findIndex(item => item.id === store.state.msg?.id)
            return i === -1 ? null : i
        })

        // Data needed for prev/next buttons
        const prev = computed(() => {
            // Prev is either current-1 or last item if current message not valid/in-history
            const prev_i = (current.value ?? store.state.history.length) - 1
            if (prev_i < 0){
                return null  // Currently showing first message (or no history at all)
            }
            const item = store._state.history[prev_i]!
            return {
                label: item.title,
                date: item.published.toLocaleDateString(),
                load: () => {
                    store.change_transition('prev')
                    void store.change_msg(item.id, item.secret_url64, item.title,
                        item.published)
                },
            }
        })
        const next = computed(() => {
            // Next is only shown if current item is in history and not last item
            if (current.value === null || current.value >= store.state.history.length - 1){
                return null
            }
            const item = store._state.history[current.value + 1]!
            return {
                label: item.title,
                date: item.published.toLocaleDateString(),
                load: () => {
                    store.change_transition('next')
                    void store.change_msg(item.id, item.secret_url64, item.title,
                        item.published)
                },
            }
        })

        // Expose
        return {prev, next}
    },
})

</script>


<style lang='sass' scoped>

@import 'src/shared/styles/utils'


.title
    margin-top: 50px !important
    text-align: center
    opacity: 0.8
    font-size: 14px !important

.history
    display: flex
    justify-content: space-between
    width: 100%
    box-sizing: border-box  // Important so 100% width doesn't overflow page in Safari
    max-width: $stello_content_width
    margin: 0 auto
    padding: 0 24px

    .prev, .next
        display: flex
        flex-direction: column

        span
            opacity: 0.8
            font-size: 0.8em

        a
            cursor: pointer
            font-weight: bold
            color: inherit

    .prev
        align-items: flex-start

    .next
        align-items: flex-end

</style>

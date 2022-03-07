
<template lang='pug'>

div.unsubscribed(v-if='unsubscribed || !responder' class='ui')
    div.alert

        template(v-if='responder === null') Network issue detected
        template(v-else-if='responder === false') This account is no longer active
        template(v-else-if='unsubscribed')
            | You've unsubscribed
            a(@click='undo') UNDO

</template>


<script lang='ts'>

import {computed, defineComponent} from 'vue'

import {store} from '@/services/store'
import {displayer_config} from '@/services/displayer_config'


export default defineComponent({
    setup(){
        return {
            responder: computed(() => displayer_config.responder),
            unsubscribed: computed(() => store.unsubscribed),
            undo: () => {void store.update_subscribed(true)},
        }
    },
})

</script>


<style lang='sass' scoped>

.unsubscribed
    text-align: center

    .alert
        padding: 4px 12px
        font-size: 16px
        background-color: #ffcc00
        color: rgba(black, 0.8)

        a
            margin-left: 12px
            font-weight: bold
            color: inherit

            &:hover
                text-decoration: underline

</style>

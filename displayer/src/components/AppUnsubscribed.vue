
<template lang='pug'>

div.unsubscribed(v-if='unsubscribed || config_error' class='ui')
    div.alert

        template(v-if='config_error === "network"') Network issue detected
        template(v-else-if='config_error === "decrypt"') Invalid URL
        template(v-else-if='config_error === "inactive"') This account is no longer active
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
            config_error: computed(() => displayer_config.error),
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

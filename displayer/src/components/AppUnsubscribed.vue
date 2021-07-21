
<template lang='pug'>

div.unsubscribed(v-if='unsubscribed' class='ui')
    div.alert
        | You've unsubscribed
        a(@click='undo') Undo

</template>


<script lang='ts'>

import {computed} from 'vue'

import {store} from '../services/store'


export default {
    setup(){
        return {
            unsubscribed: computed(() => store.unsubscribed),
            undo: () => {store.update_subscribed(true)},
        }
    }
}

</script>


<style lang='sass' scoped>

.unsubscribed
    text-align: center

    .alert
        display: inline-block
        padding: 4px 12px
        margin: 0 12px 36px 12px
        font-size: 16px
        background-color: #ffcc00
        color: rgba(black, 0.8)
        border-radius: 12px

        a
            margin-left: 12px
            text-decoration: underline
            font-weight: bold

</style>

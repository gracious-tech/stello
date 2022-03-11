
<template lang='pug'>

//- Show credit only when message decrypted (hide origins from unauthenticated viewers)
div.footer(v-if='msg?.data' class='ui')

    div(v-if='can_change_subscription')
        a(@click='toggle_subscription' :class='{unsubscribed}') {{ toggle_label }}
        template(v-if='msg.data.contact_address ?? true')
            |
            | |
            |
            a(@click='change_address') Change email address

    div
        | Created with
        |
        a(href='https://stello.news/' target='_blank') {{ app_name }}

</template>


<script lang='ts'>

import {computed, defineComponent} from 'vue'

import app_config from '../app_config.json'
import DialogChangeAddress from './DialogChangeAddress.vue'
import {store} from '../services/store'
import {displayer_config} from '@/services/displayer_config'


export default defineComponent({
    setup(){

        const msg = computed(() => store.state.msg)

        const unsubscribed = computed(() => store.unsubscribed)
        const toggle_label = computed(() => store.unsubscribed ? "Resubscribe" : "Unsubscribe")
        const can_change_subscription = computed(() => {
            // NOTE permission_subscription/contact_address did not exist until after v0.6.2
            return displayer_config.responder &&
                (store.state.msg!.data!.permission_subscription ?? true)
        })

        const toggle_subscription = () => {
            void store.update_subscribed(store.unsubscribed)
        }

        const change_address = () => {
            store.dialog_open(DialogChangeAddress, {
                old_address: store.state.msg!.data!.contact_address,
            })
        }

        return {
            msg,
            app_name: app_config.name,
            unsubscribed,
            toggle_subscription,
            toggle_label,
            change_address,
            can_change_subscription,
        }
    },
})

</script>


<style lang='sass' scoped>

.footer
    text-align: center
    opacity: 0.5
    font-size: 13px !important
    margin-top: 100px

    &:hover
        opacity: 1

    div
        margin-bottom: 12px

    a
        text-decoration: underline

        &:not(.unsubscribed)
            color: inherit !important  // Don't stand out

</style>

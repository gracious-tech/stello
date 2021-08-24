
<template lang='pug'>

//- Show credit only when message decrypted (hide origins from unauthenticated viewers)
div.footer(v-if='msg' class='ui')

    //- NOTE permission_subscription/contact_address did not exist until after v0.6.2
    div(v-if='msg.permission_subscription ?? true')
        a(@click='toggle_subscription' :class='{unsubscribed}') {{ toggle_label }}
        template(v-if='msg.contact_address ?? true')
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

import {computed, PropType, defineComponent} from 'vue'

import app_config from '../app_config.json'
import DialogChangeAddress from './DialogChangeAddress.vue'
import {PublishedCopy} from '../shared/shared_types'
import {store} from '../services/store'


export default defineComponent({
    props: {
        msg: {type: Object as PropType<PublishedCopy|undefined>, required: false},
    },
    setup(props){

        const unsubscribed = computed(() => store.unsubscribed)
        const toggle_label = computed(() => store.unsubscribed ? "Resubscribe" : "Unsubscribe")

        const toggle_subscription = () => {
            store.update_subscribed(store.unsubscribed)
        }

        const change_address = () => {
            store.dialog_open(DialogChangeAddress, {old_address: props.msg!.contact_address})
        }

        return {
            app_name: app_config.name,
            unsubscribed,
            toggle_subscription,
            toggle_label,
            change_address,
        }
    }
})

</script>


<style lang='sass' scoped>

.footer
    text-align: center
    opacity: 0.5
    font-size: 13px !important
    margin: 100px 0

    &:hover
        opacity: 1

    div
        margin-bottom: 12px

    a
        text-decoration: underline

        &:not(.unsubscribed)
            color: inherit !important  // Don't stand out

</style>


<template lang='pug'>

template(v-if='msg.data')
    MessageContents(:sections='msg.data.sections')
    MessageReply
    MessagePage

div.no_data(v-else class='ui')

    h1 {{ msg.title }}
    p.date {{ msg.published?.toLocaleString() }}

    AppProgress(v-if='!msg.data_error')
    template(v-else)
        h2.error {{ error_desc }}
        button(v-if='fix_label' @click='fix' class='btn-text s-primary') {{ fix_label }}

</template>


<script lang='ts'>

import {computed, defineComponent} from 'vue'

import DialogResend from './DialogResend.vue'
import MessageContents from './MessageContents.vue'
import MessagePage from './MessagePage.vue'
import MessageReply from './MessageReply.vue'

import {store} from '@/services/store'
import {displayer_config} from '@/services/displayer_config'


export default defineComponent({

    components: {MessageContents, MessagePage, MessageReply},

    setup(){

        // Access to msg
        const msg = computed(() => store.state.msg!)

        // Display different text depending on which error
        const error_desc = computed(() => {
            if (store.state.msg!.data_error === 'network'){
                return "Download interrupted (check your internet connection)"
            } else if (store.state.msg!.data_error === 'expired'){
                return "Message has expired"
            } else if (store.state.msg!.data_error === 'corrupted'){
                return "Could not read message (part of the link may be missing)"
            }
            return "Unknown error"
        })
        const fix_label = computed(() => {
            if (store.state.msg!.data_error === 'expired'){
                if (displayer_config.allow_resend_requests){
                    return "Request new copy"
                }
                return null  // Can't show any button
            }
            return "Retry"
        })

        // Method for resolving errors
        const fix = () => {
            if (store.state.msg!.data_error === 'expired'){
                store.dialog_open(DialogResend)
            } else {
                void store.get_msg_data()
            }
        }

        return {
            msg,
            error_desc,
            fix,
            fix_label,
        }
    },
})

</script>


<style lang='sass' scoped>

@import '../shared/shared_mixins'

.no_data
    margin-top: 100px
    text-align: center

    h1
        margin-bottom: 0

    .date
        margin-bottom: 36px

    .loading
        margin-bottom: 44px

    .error
        margin-bottom: 36px
        @include stello_themed(color, #b70, #f90)

</style>

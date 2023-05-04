
<template lang='pug'>

div.intro(v-html='form.text')

input(v-model='name' placeholder="Full name...")
input(v-model='address' type='email' placeholder="Email address...")
textarea(v-if='form.accept_message' ref='textarea' v-model='message' placeholder="Message...")
div.success(v-if='success') {{ success }}

div.actions
    button(@click='close' class='btn-text') Close
    button(@click='send' :disabled='!valid || progress' class='btn-text s-primary'
            :class='{error, progress}')
        template(v-if='progress')
            AppProgress
        template(v-else) Subscribe

</template>


<script lang='ts'>

import {computed, onMounted, ref, watch, defineComponent, PropType} from 'vue'

import {store} from '../services/store'
import {respond_subscribe} from '../services/responses'
import {SubscribeFormConfig} from '@/shared/shared_types'
import {email_address_like} from '@/services/utils/misc'


export default defineComponent({
    props: {
        form: {type: Object as PropType<SubscribeFormConfig>, required: true},
    },
    setup(props){

        // Refs
        const textarea = ref<HTMLTextAreaElement>()
        const name = ref('')
        const address = ref('')
        const message = ref('')
        const progress = ref(false)
        const error = ref(false)
        const success = ref(null as null|string)

        // Computed
        const valid = computed(() => name.value && email_address_like(address.value))

        // Methods
        const close = () => {store.dialog_close()}
        const send = async () => {
            progress.value = true
            error.value = false
            success.value = null
            if (await respond_subscribe(props.form.id, address.value, name.value, message.value)){
                success.value = `${address.value} subscribed`
                name.value = ''
                address.value = ''
                message.value = ''
            } else {
                error.value = true
            }
            progress.value = false
        }

        // Watches
        onMounted(() => {
            watch(message, () => {
                // Auto grow textarea to fit content
                // NOTE textarea may not exist if accept_message option not enabled
                if (textarea.value){
                    textarea.value.style.minHeight = `${textarea.value.scrollHeight}px`
                }
            }, {immediate: true})
        })

        // Expose
        return {close, send, progress, error, success, textarea, valid, name, address, message}
    },
})

</script>


<style lang='sass' scoped>

.intro
    width: 100%

textarea, input
    margin: 8px

textarea
    resize: none

.success
    color: hsl(120, 50%, 50%)

.actions
    // Separate close & subscribe buttons so don't accidently close (as hard to get back again)
    width: 100%
    justify-content: space-between

</style>

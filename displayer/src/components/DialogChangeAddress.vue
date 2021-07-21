
<template lang='pug'>

h2 Change email address

p(v-if='old_address') This message was sent to: #[em {{ old_address }}]

input(v-model='address' type='email' class='input-text' placeholder="New email address...")

div.actions
    button(@click='close' class='btn-text') Cancel
    button(@click='change' :disabled='!valid || progress' class='btn-text s-primary'
            :class='{error, progress}')
        template(v-if='progress')
            AppProgress
        template(v-else) Change

</template>


<script lang='ts'>

import {computed, ref} from 'vue'

import {store} from '../services/store'
import {respond_address} from '../services/responses'


export default {
    props: {
        old_address: {type: String, default: null},
        encrypted_address: {type: String, default: null},
    },
    setup(props){

        // Refs
        const address = ref('')
        const progress = ref(false)
        const error = ref(false)

        // Computed
        const valid = computed(() => /.+@.+\..+/.test(address.value))

        // Methods
        const close = () => {store.dialog_close()}
        const change = async () => {
            progress.value = true
            error.value = false
            const token = store.state.current_msg!.resp_token
            if (await respond_address(token, address.value, props.encrypted_address)){
                close()
            } else {
                error.value = true
            }
            progress.value = false
        }

        // Expose
        return {close, change, address, progress, error, valid}
    }
}

</script>


<style lang='sass' scoped>

input
    margin-top: 12px
    margin-bottom: 24px
    max-width: 350px

.actions
    align-self: flex-end
    display: flex

    button
        margin-left: 12px
        min-width: 90px
        justify-content: center

        &.error
            background-color: rgba(#f00, 0.3) !important

        &.progress
            padding: 6px

        svg  // AppProgress
            width: 20px
            height: 20px

            ::v-deep(circle)
                stroke: currentColor !important


</style>

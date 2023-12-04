
<template lang='pug'>

h2 Unsubscribe

p Are you sure you'd like to unsubscribe?

div.actions
    button(@click='close' class='btn-text') Cancel
    button(@click='submit' class='btn-text s-primary') Unsubscribe

</template>


<script lang='ts'>

import {defineComponent} from 'vue'

import {store} from '../services/store'


export default defineComponent({
    props: {
        encrypted_address: {type: String, default: null},
    },
    setup(props){

        // Methods
        const close = () => {
            store.dialog_close()
        }
        const submit = () => {
            void store.update_subscribed(false, props.encrypted_address)
            close()
        }

        // Expose
        return {close, submit}
    },
})

</script>


<style lang='sass' scoped>


</style>

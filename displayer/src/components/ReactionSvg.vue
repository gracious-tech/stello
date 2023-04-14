
<template lang='pug'>

SharedSvgAnimated(:url='url' :class='{chosen}' :playing='playing')

</template>


<script lang='ts'>

import {defineComponent} from 'vue'

import SharedSvgAnimated from '../shared/SharedSvgAnimated.vue'
import {reaction_url} from '../shared/shared_functions'


export default defineComponent({

    components: {SharedSvgAnimated},

    props: {
        reaction: {
            type: String,
            required: true,
        },
        chosen: {
            type: Boolean,
            default: false,
        },
        playing: {
            type: Boolean,
            default: true,
        },
    },

    computed: {
        url(){
            return reaction_url(this.reaction, 'displayer/')
        },
    },
})

</script>


<style lang='sass' scoped>

.chosen
    box-shadow: 0 10px 10px -10px rgba(#000, 0.7)

</style>

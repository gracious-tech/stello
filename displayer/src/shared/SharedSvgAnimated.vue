
<template lang='pug'>

component(:is='comp' :url='url' :playing='playing')

</template>


<script lang='ts'>

import SharedSvgCss from './SharedSvgCss.vue'
import SharedSvgLottie from './SharedSvgLottie.vue'


export default {

    props: {
        url: {
            type: String,
            required: true,
        },
        playing: {
            type: Boolean,
            default: true,
        },
    },

    computed: {
        comp():typeof SharedSvgLottie|typeof SharedSvgCss{
            return this.url.toLowerCase().endsWith('.json') ? SharedSvgLottie : SharedSvgCss
        },
    },
}

</script>


<style lang='sass' scoped>

</style>

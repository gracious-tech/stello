
<template lang='pug'>

component.root(:is='comp' :url='url' :playing='playing_final' @mouseenter.native='hovering = true'
    @mouseleave.native='hovering = false' :class='{pray}')

</template>


<script lang='ts'>

import {defineComponent} from 'vue-demi'

import SharedSvgCss from './SharedSvgCss.vue'
import SharedSvgLottie from './SharedSvgLottie.vue'


export default defineComponent({

    props: {
        url: {
            type: String,
            required: true,
        },
        playing: {
            type: Boolean,
            default: true,
        },
        hover: {  // Whether to always play on hover
            type: Boolean,
            default: true,
        },
    },

    data(){
        return {
            hovering: false,
        }
    },

    computed: {
        comp():typeof SharedSvgLottie|typeof SharedSvgCss{
            return this.url.toLowerCase().endsWith('.json') ? SharedSvgLottie : SharedSvgCss
        },
        playing_final(){
            return this.playing || (this.hover && this.hovering)
        },
        pray(){
            return this.url.endsWith('pray.svg')
        },
    },
})

</script>


<style lang='sass' scoped>

.root, .root ::v-deep svg
    display: flex
    width: 100%
    height: 100%

// Hack for prayer emoji to match scale of lottie emojis that don't have internal padding
.pray ::v-deep svg
    transform: scale(1.2)

</style>

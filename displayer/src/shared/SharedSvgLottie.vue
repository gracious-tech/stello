
<template lang='pug'>

div.lottie(ref='container')

</template>


<script lang='ts'>

import {defineComponent} from 'vue-demi'
// Import type (careful to avoid importing module as will do so dynamically)
import type {AnimationItem} from 'lottie-web'
import {report_http_failure, request_text} from '@/services/utils/http'


// Dynamically load lottie module so it is not included in the main app bundle
const lottie_promise = import('lottie-web/build/player/lottie_light')


// Keep a cache of responses so don't make same requests multiple times
const lottie_cache:Record<string, string> = {}


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
    },

    data(){
        return {
            lottie_instance: null as (AnimationItem|null),
        }
    },

    watch: {

        url: {
            immediate: true,
            async handler(){
                // Recreate lottie instance whenever url changes
                // NOTE Errors not caught as Vue will catch and report them without UI failure

                // Remove the previous instance if any (must happen even if below fails)
                this.destroy_lottie()

                // Store response in cache
                if (! (this.url in lottie_cache)){
                    try {
                        lottie_cache[this.url] = await request_text(this.url)
                    } catch (error){
                        report_http_failure(error)
                        return
                    }
                }

                // Wait for lottie module if it hasn't loaded yet
                const lottie = await lottie_promise

                // Load the animation
                this.lottie_instance = lottie.default.loadAnimation({
                    container: this.$refs['container'] as HTMLDivElement,
                    renderer: 'svg',
                    loop: true,
                    autoplay: this.playing,
                    // WARN Must parse per use as lottie manipulates the data & reuse -> memory leak
                    animationData: JSON.parse(lottie_cache[this.url]!) as unknown,
                })

                // Start at most appropriate frame (see below too)
                this.lottie_instance[this.playing ? 'goToAndPlay' : 'goToAndStop']('rest')
            },
        },

        // Pause/play animation when `playing` property changes
        playing: {
            handler(playing){
                if (this.lottie_instance){
                    // Pause on most appropriate frame for conveying the meaning of the emoji
                    // NOTE Expects lottie JSON to have marker called 'rest'
                    this.lottie_instance[playing ? 'goToAndPlay' : 'goToAndStop']('rest')
                }
            },
        },
    },

    beforeDestroy(){  // eslint-disable-line vue/no-deprecated-destroyed-lifecycle -- Vue 2
        this.destroy_lottie()
    },

    beforeUnmount(){  // Vue 3
        this.destroy_lottie()
    },

    methods: {
        destroy_lottie(){
            // Destory lottie instance (if any)
            // WARN Otherwise don't get garbage collected (exponential memory usage)
            if (this.lottie_instance){
                this.lottie_instance.destroy()
            }
        },
    },
})

</script>


<style lang='sass' scoped>

</style>


<template lang='pug'>

div(ref='container')

</template>


<script lang='ts'>

// Import type (careful to avoid importing module as will do so dynamically)
import type {AnimationItem} from 'lottie-web'


// Dynamically load lottie module so it is not included in the main app bundle
const lottie_promise = import('lottie-web/build/player/lottie_light')


// Keep a cache of responses so don't make same requests multiple times
const lottie_cache:Record<string, string> = {}


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

    data(){
        return {
            lottie_instance: null as (AnimationItem|null),
        }
    },

    watch: {

        url: {
            immediate: true,
            async handler(url){
                // Recreate lottie instance whenever url changes

                // Store response in cache
                if (! (url in lottie_cache)){
                    lottie_cache[url] = await (await fetch(url)).text()
                }

                // Wait for lottie module if it hasn't loaded yet
                const lottie = await lottie_promise

                // Load the animation
                this.lottie_instance = lottie.default.loadAnimation({
                    container: this.$refs.container as HTMLDivElement,
                    renderer: 'svg',
                    loop: true,
                    autoplay: this.playing,
                    animationData: JSON.parse(lottie_cache[url]),
                })
            },
        },

        // Pause/play animation when `playing` property changes
        playing: {
            handler(playing){
                if (this.lottie_instance){
                    playing ? this.lottie_instance.play() : this.lottie_instance.pause()
                }
            },
        },
    },
}

</script>


<style lang='sass' scoped>

</style>

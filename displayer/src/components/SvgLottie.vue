
<template lang='pug'>

div(ref='container')

</template>


<script lang='ts'>

import {ref, onMounted, watch} from 'vue'
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

    setup(props){

        // Refs for div container and initiated lottie instance
        const container = ref<HTMLDivElement>()
        const lottie_instance = ref<AnimationItem>()

        // Can't call lottie until DOM ready
        onMounted(() => {
            // Recreate lottie instance whenever url changes
            watch(() => props.url, async url => {

                // Store response in cache
                if (! (url in lottie_cache)){
                    lottie_cache[url] = await (await fetch(url)).text()
                }

                // Wait for lottie module if it hasn't loaded yet
                const lottie = await lottie_promise

                // Load the animation
                lottie_instance.value = lottie.default.loadAnimation({
                    container: container.value!,
                    renderer: 'svg',
                    loop: true,
                    autoplay: props.playing,
                    animationData: JSON.parse(lottie_cache[url]),
                })
            }, {immediate: true})
        })

        // Pause/play animation when `playing` property changes
        watch(() => props.playing, playing => {
            if (lottie_instance.value){
                playing ? lottie_instance.value.play() : lottie_instance.value.pause()
            }
        })

        return {container}
    },
}

</script>


<style lang='sass' scoped>

</style>

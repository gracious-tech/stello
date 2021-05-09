
<template lang='pug'>

div(v-html='html' :class='{paused}')

</template>


<script lang='ts'>

import {ref, watch, computed} from 'vue'


const cache:Record<string, string> = {}


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
        // The html/svg contents
        const html = ref<string>()
        watch(() => props.url, async url => {
            // Re-request contents when url changes
            if (! (url in cache)){
                // Cache the contents so don't make same request multiple times
                cache[url] = await (await fetch(url)).text()
            }
            html.value = cache[url]
        }, {immediate: true})

        // Expose playing value via its opposite (paused)
        const paused = computed(() => !props.playing)

        return {html, paused}
    },
}

</script>


<style lang='sass' scoped>

div.paused :deep(*)
    animation-play-state: paused !important

</style>

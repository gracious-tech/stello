
<template lang='pug'>

div.root(v-html='html' :class='{playing}')

</template>


<script lang='ts'>

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

    data(){
        return {
            html: '',
        }
    },

    watch: {
        url: {
            immediate: true,
            async handler(url){
                // Re-request contents when url changes
                if (! (url in cache)){
                    // Cache the contents so don't make same request multiple times
                    cache[url] = await (await fetch(url)).text()
                }
                this.html = cache[url]
            },
        },
    },
}

</script>


<style lang='sass' scoped>

.root:not(.playing) :deep(*)
    // Set animation-name rather than animation-play-state so stopped at first keyframe
    animation-name: none !important

</style>


<template lang='pug'>

div.root(v-html='html' :class='{playing}')

</template>


<script lang='ts'>

const cache:Record<string, string> = {}


export function generate_unique_id():string{
    // Generates 3 bytes worth of random integers and concats them to form a random id
    return crypto.getRandomValues(new Uint8Array(3)).join('')
}


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
                // NOTE Errors not caught as Vue will catch and report them without UI failure

                // Remove previous value if any (must happen even if below fails)
                this.html = ''

                if (! (url in cache)){
                    // Cache the contents so don't make same request multiple times
                    const resp = await fetch(url).catch(() => null)
                    if (!resp?.ok){
                        throw new Error(`${resp?.status} ${resp?.statusText}`)
                    }
                    cache[url] = await resp.text()
                }

                // Replace ids with a random prefix for every use to avoid `id` clashes in DOM
                // WARN id clashes have actual affect on display of SVGs, especially gradients
                // NOTE SVG sources are expected to prefix all ids with generic `IDPREFIX` code
                // WARN ids must begin with a letter or are invalid
                this.html = cache[url].replaceAll('IDPREFIX', 'ID' + generate_unique_id())
            },
        },
    },
}

</script>


<style lang='sass' scoped>

.root:not(.playing) ::v-deep *
    // Set animation-name rather than animation-play-state so stopped at first keyframe
    animation-name: none !important

</style>

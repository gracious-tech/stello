
<template lang='pug'>

div.aspect
    iframe(v-if='format' :src='src' allowfullscreen
        sandbox='allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'
        allow='fullscreen; encrypted-media; gyroscope; accelerometer; clipboard-write; picture-in-picture')
    svg(v-else @click='$emit("modify")' width='32' height='18' viewBox='0 0 32 18')
        path(d='M 22,4.5 H 10 c -1.1,0 -2,0.9 -2,2 v 5 c 0,1.1 0.9,2 2,2 h 12 c 1.1,0 2,-0.9 2,-2 v -5 c 0,-1.1 -0.9,-2 -2,-2 z m -7.5,7 v -5 l 4,2.5 z')

</template>


<script lang='ts'>

export default {

    props: {
        format: {
            type: String,
        },
        id: {
            type: String,
        },
        start: {
            type: Number,
        },
        end: {
            type: Number,
        },
    },

    computed: {

        safe_id(){
            // Get escaped version of video id
            return encodeURIComponent(this.id)
        },

        src(){
            // Get the src for the iframe
            if (this.format === 'iframe_youtube'){
                const params = new URLSearchParams([
                    /* SECURITY Not using `origin` param as it exposes message's domain to Youtube
                        Youtube uses the origin param in its analytics (https://developers.google.com/youtube/player_parameters.html?playerVersion=HTML5#widget_referrer)
                        Security benefit nill since not enabling the JS API anyway
                    */
                    ['modestbranding', '1'],  // Hide Youtube button in toolbar
                    ['rel', '0'],  // Only show related videos from same channel (can't disable)
                ])
                if (this.start !== null){
                    params.set('start', this.start)
                }
                if (this.end !== null){
                    params.set('end', this.end)
                }
                return `https://www.youtube-nocookie.com/embed/${this.safe_id}?${params}`
            } else if (this.format === 'iframe_vimeo'){
                const params = new URLSearchParams([
                    ['dnt', '1'],  // Do not track
                ])
                let hash = ''
                if (this.start){
                    const mins = Math.floor(this.start / 60)
                    const secs = this.start % 60
                    hash = `#t=${mins}m${secs}s`
                }
                return `https://player.vimeo.com/video/${this.safe_id}?${params}${hash}`
            }
            return null
        },

    },
}

</script>


<style lang='sass' scoped>

.aspect
    position: relative
    width: 100%
    height: 0
    padding-bottom: percentage(9 / 16)

iframe, svg
    position: absolute
    height: 100%
    width: 100%
    border-radius: 12px

iframe
    background-color: #000  // Vimeo bg transparent when size differs and looks weird

svg
    background-color: #55555522
    cursor: pointer

    path
        fill: #55555533


</style>


<template lang='pug'>

div
    div.aspect
        //- NOTE allow-forms required for entering a Vimeo password
        iframe(v-if='src' :src='src' allowfullscreen
            sandbox='allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms'
            allow='fullscreen; encrypted-media; gyroscope; accelerometer; clipboard-write; picture-in-picture')
        svg(v-else @click='$emit("modify")' width='32' height='18' viewBox='0 0 32 18')
            path(d='M 22,4.5 H 10 c -1.1,0 -2,0.9 -2,2 v 5 c 0,1.1 0.9,2 2,2 h 12 c 1.1,0 2,-0.9 2,-2 v -5 c 0,-1.1 -0.9,-2 -2,-2 z m -7.5,7 v -5 l 4,2.5 z')

    div.cap(v-if='caption') {{ caption }}

</template>


<script lang='ts'>

import type {PropType} from 'vue'  // Importing just as type should still keep compatible with Vue 2
import {defineComponent} from 'vue-demi'


export default defineComponent({

    props: {
        format: {
            type: String as PropType<string|null>,
            default: null,
        },
        id: {
            type: String as PropType<string|null>,
            default: null,
        },
        caption: {
            type: String,
            default: '',
        },
        start: {
            type: Number as PropType<number|null>,
            default: null,
        },
        end: {
            type: Number as PropType<number|null>,
            default: null,
        },
    },

    computed: {

        safe_id():string{
            // Get escaped version of video id
            return encodeURIComponent(this.id!)
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
                if (typeof this.start === 'number'){
                    params.set('start', `${this.start}`)
                }
                if (typeof this.end === 'number'){
                    params.set('end', `${this.end}`)
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
})

</script>


<style lang='sass' scoped>

.aspect
    position: relative
    width: 100%
    height: 0
    padding-bottom: 56.25%  // 9 / 16

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

.cap  // Avoid Vuetify's caption class
    text-align: center
    opacity: 0.6
    font-size: 0.75em
    line-height: 1.2  // Minimize distance from wrapped text
    padding-top: 10px


</style>

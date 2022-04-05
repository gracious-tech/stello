
<template lang='pug'>

div
    div.aspect
        iframe(v-if='src' :src='src' :sandbox='sandbox' :allow='allow')
        svg(v-else @click='$emit("modify")' width='32' height='18' viewBox='0 0 32 18')
            path(d=`M 22,4.5 H 10 c -1.1,0 -2,0.9 -2,2 v 5 c 0,1.1 0.9,2 2,2 h 12 c 1.1,0 2,-0.9 2,
                -2 v -5 c 0,-1.1 -0.9,-2 -2,-2 z m -7.5,7 v -5 l 4,2.5 z`)

    div.cap(v-if='caption') {{ caption }}

</template>


<script lang='ts'>

import type {PropType} from 'vue'  // Importing just as type should still keep compatible with Vue 2
import {defineComponent} from 'vue-demi'


export default defineComponent({

    props: {
        format: {
            type: String as PropType<'iframe_youtube'|'iframe_vimeo'|null>,
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
            // NOTE Vimeo id may be a two part `id/password` if in private mode
            return encodeURIComponent(
                this.format === 'iframe_vimeo' ? this.id!.split('/')[0]! : this.id!)
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
                return `https://www.youtube-nocookie.com/embed/${this.safe_id}?${params.toString()}`
            } else if (this.format === 'iframe_vimeo'){
                const params = new URLSearchParams([
                    ['dnt', '1'],  // Do not track
                ])
                // If in private mode, vimeo id should be `id/password`
                if (this.id!.includes('/')){
                    params.append('h', this.id!.split('/')[1]!)
                }
                let hash = ''
                if (this.start){
                    const mins = Math.floor(this.start / 60)
                    const secs = this.start % 60
                    hash = `#t=${mins}m${secs}s`
                }
                return `https://player.vimeo.com/video/${this.safe_id}?${params.toString()}${hash}`
            }
            return null
        },

        sandbox():string{
            // REDUCES restrictions imposed by sandbox
            if (this.format === 'iframe_youtube'){
                //- NOTE Youtube requires access to its own origin (doesn't grant access to page's)
                return 'allow-scripts allow-same-origin'
            } else if (this.format === 'iframe_vimeo'){
                //- NOTE allow-forms required for entering a Vimeo password
                return 'allow-scripts allow-forms'
            }
            return ''
        },

        allow():string{
            // INCREASES permissions not normally granted to iframes
            // NOTE clipboard-write for copying URL (players can write even without explicit perm)
            return 'fullscreen; encrypted-media; gyroscope; accelerometer; clipboard-write;'
                + ' picture-in-picture;'
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
    border-radius: var(--stello-radius)

iframe
    background-color: #000  // Vimeo bg transparent when size differs and looks weird

svg
    background-color: #55555522
    cursor: pointer

    path
        fill: #55555533


</style>

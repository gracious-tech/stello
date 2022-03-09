
<template lang='pug'>

svg(:viewBox='view_box' :class='{first}' @click='$emit("click")')
    g(:clip-path='first ? clip_path : clip_path_both')
        //- NOTE preserveAspectRatio not necessary since component already preserves ratio of image
        //-      However that might change, so leaving as safeguard (similar to css' size "cover")
        image(:href='image_url' width='100%' height='100%' preserveAspectRatio='xMidYMid slice')
        foreignObject(v-if='image.caption' width='100%' height='100%')
            h1(:class='`style-${theme_style}`') {{ image.caption }}

</template>


<script lang='ts'>

import type {PropType} from 'vue'  // Importing just as type should still keep compatible with Vue 2
import {defineComponent} from 'vue-demi'


export default defineComponent({

    props: {
        image: {
            type: Object as PropType<{data:Blob, caption:string}>,
            required: true,
        },
        theme_style: {
            type: String,
            required: true,
        },
        first: {  // Whether hero is first row (won't clip top)
            type: Boolean,
            require: true,
        },
    },

    data(){
        return {
            relative_height: 500,  // Height that results in same aspect as image when width 1000
        }
    },

    computed: {
        view_box(){
            // Dynamic viewbox to keep same aspect ratio as image
            return `0 0 1000 ${this.relative_height}`
        },
        image_url(){
            return URL.createObjectURL(this.image.data)
        },
        clip_path(){
            // Path spec to use to clip image and text (only clips bottom)
            // NOTE Paths go anti-clockwise from TL BL BR TR
            const rh = this.relative_height
            if (this.theme_style === 'modern'){
                return `path('m 0,0 v ${rh-100} l 200,50 h 600 l 200,50  V0z')`
            } else if (this.theme_style === 'formal'){
                return `path('m 0,0 v ${rh-50} l 300,50 700,-50  V0z')`
            } else if (this.theme_style === 'beautiful'){
                return `path('m 0,0 v ${rh-30} c 600,-100 800,100 1000,0  V0z')`
            } else if (this.theme_style === 'fun'){
                return `path('m 0,0 v ${rh-60} t 100,40 200,-40 300,10 200,-20 200,0  V0z')`
            }
            return ''
        },
        clip_path_both(){
            // Path spec that also clips top
            // NOTE Replaces original with paths back from top-right to top-left
            if (this.theme_style === 'modern'){
                return this.clip_path.replace('V0z', 'V100 l -200,-50 h -600 l -200,-50 z')
            } else if (this.theme_style === 'formal'){
                return this.clip_path.replace('V0z', 'V0 l -700,50 -300,-50  z')
            } else if (this.theme_style === 'beautiful'){
                return this.clip_path.replace('V0z', 'V30  c -200,100 -400,-100 -1000,0  z')
            } else if (this.theme_style === 'fun'){
                return this.clip_path.replace('V0z',
                    'V80 t -50,-50 -100,20 -200,-5 -300,0 -200,0 -200,-10 z')
            }
            return ''
        },
    },

    watch: {
        'image.data': {
            immediate: true,
            async handler(){
                // Recalculate relative height whenever image changes
                const bitmap = await createImageBitmap(this.image.data)
                this.relative_height = Math.round(bitmap.height / bitmap.width * 1000)
            },
        },
    },
})

</script>


<style lang='sass' scoped>

svg
    width: 100%
    user-select: none
    display: block  // Inline has padding due to line-height etc

    h1
        font-size: 80px
        display: inline-block
        padding: 12px 24px
        margin: 100px 48px  // Top margin must be enough to avoid top clipping
        line-height: 1.25
        color: white !important
        background-color: var(--stello-hue-hero)
        border-radius: var(--stello-radius)

        &.style-beautiful
            // Beautiful font looks smaller than others due to long strokes
            font-size: 130px
            line-height: 0.8
            padding: 36px 24px

    &.first
        h1
            margin: 48px  // No top clipping so normal margin

</style>
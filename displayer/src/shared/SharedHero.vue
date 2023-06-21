
<template lang='pug'>

svg(:viewBox='view_box' :class='{first}' @click='$emit("click")')
    g(:clip-path='first ? clip_path : clip_path_both')
        //- NOTE preserveAspectRatio not necessary since component already preserves ratio of image
        //-      However that might change, so leaving as safeguard (similar to css' size "cover")
        //- WARN Safari (at least 11.1) requires the xlink prefix, where as Chrome does not
        image(v-if='image_url' :xlink:href='image_url' width='100%' height='100%'
            preserveAspectRatio='xMidYMid slice')
        foreignObject(v-if='image.caption' width='100%' height='100%')
            h1(:class='`style-${theme_style}`') {{ image.caption }}

</template>


<script lang='ts'>

import type {PropType} from 'vue'  // Importing just as type should still keep compatible with Vue 2
import {defineComponent} from 'vue-demi'


export default defineComponent({

    props: {
        image: {
            type: Object as PropType<{data:Blob|null, caption:string}>,
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
        aspect: {
            type: Array as unknown as PropType<[number, number]>|null,
            default: null,
        },
    },

    data(){
        return {
            relative_height: 500,  // Height that results in same aspect as image when width 1000
            image_url: '',
        }
    },

    computed: {
        view_box(){
            // Dynamic viewbox to keep same aspect ratio as image
            return `0 0 1000 ${this.relative_height}`
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
                // Generate URL for the image blob
                URL.revokeObjectURL(this.image_url)
                this.image_url = this.image.data ? URL.createObjectURL(this.image.data) : ''

                // Recalculate relative height whenever image changes
                if (this.aspect){
                    // Aspect will be directly provided in displayer
                    this.relative_height = Math.round(this.aspect[1] / this.aspect[0] * 1000)
                } else if (this.image.data){
                    // Calculate on-the-fly in editor
                    // WARN createImageBitmap not available in all browsers so access from self
                    const bitmap = await self.createImageBitmap(this.image.data)
                    this.relative_height = Math.round(bitmap.height / bitmap.width * 1000)
                }
            },
        },
    },

    destroyed(){  // eslint-disable-line vue/no-deprecated-destroyed-lifecycle -- Vue 2
        URL.revokeObjectURL(this.image_url)
    },

    unmounted(){  // Vue 3
        URL.revokeObjectURL(this.image_url)
    },
})

</script>


<style lang='sass' scoped>

svg
    width: 100%
    user-select: none
    display: block  // Inline has padding due to line-height etc

    h1
        font-size: 60px
        display: inline-block
        padding: 12px 24px
        margin: 100px 48px  // Top margin must be enough to avoid top clipping
        line-height: 1.25
        min-height: 0  // General style sets this to avoid empty elements not taking space
        color: white !important
        background-color: var(--stello-hue-hero)
        border-radius: var(--stello-radius)

        &.style-beautiful
            // Beautiful font looks smaller than others due to long strokes
            font-size: 100px
            line-height: 0.9
            padding: 28px 24px

    &.first
        h1
            margin: 48px  // No top clipping so normal margin

</style>

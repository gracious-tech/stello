
<template lang='pug'>

div.pagebait
    div.image(v-if='image' ref='image')
    div.text
        h2.hline {{ headline }}
        //- Don't let desc exist if empty as messes up flex centering
        p.desc(v-if='desc') {{ desc }}

</template>


<script lang='ts'>

import {defineComponent} from 'vue-demi'


export default defineComponent({

    props: {
        headline: {
            type: String,
            required: true,
        },
        desc: {
            type: String,
            required: true,
        },
        image: {
            type: Blob,
            default: null,
        },
    },

    watch: {
        image: {
            immediate: true,
            handler(){
                // Once div available in DOM, apply bg image (done via JS due to CSP)
                // NOTE If no image then image div won't be rendered at all
                if (this.image){
                    const image_url = URL.createObjectURL(this.image)
                    void this.$nextTick(() => {
                        const div = this.$refs['image'] as HTMLDivElement
                        div.style.backgroundImage = `url(${image_url})`
                    })
                }
            },
        },
    },
})

</script>


<style lang='sass' scoped>


</style>

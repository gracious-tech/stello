
<template lang='pug'>

div.pagebait(:class='{"btn-text": button, "s-primary": button}')
    div.image(v-if='image && !button' ref='image')
    div.text
        h2.hline {{ headline }}
        //- Don't let desc exist if empty as messes up flex centering
        p.desc(v-if='desc && !button') {{ desc }}

</template>


<script lang='ts'>

import {defineComponent, PropType} from 'vue-demi'


export default defineComponent({

    props: {
        button: {
            type: Boolean,
            required: true,
        },
        headline: {
            type: String,
            required: true,
        },
        desc: {
            type: String,
            required: true,
        },
        image: {
            type: Blob as PropType<Blob|null>,
            default: null,
        },
    },

    data(){
        return {
            image_url: '',
        }
    },

    watch: {
        image: {
            immediate: true,
            handler(){
                // Once div available in DOM, apply bg image (done via JS due to CSP)
                // NOTE If no image then image div won't be rendered at all
                URL.revokeObjectURL(this.image_url)
                if (this.image && !this.button){
                    this.image_url = URL.createObjectURL(this.image)
                    void this.$nextTick(() => {
                        const div = this.$refs['image'] as HTMLDivElement
                        div.style.backgroundImage = `url(${this.image_url})`
                    })
                } else {
                    this.image_url = ''
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


</style>

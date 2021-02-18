
<template lang='pug'>

SharedSlideshow(:images='images' @img_click='fullscreen_enable')

teleport(v-if='fullscreen_img_style' to='.content')
    div.fullscreen(@click='fullscreen_disable' :style='fullscreen_img_style')

</template>


<script lang='ts'>

import {ref, reactive, computed, watch, onUnmounted, inject} from 'vue'

import SharedSlideshow from '../shared/SharedSlideshow.vue'
import {store} from '../services/store'
import {buffer_to_blob} from '../services/utils/coding'
import {GetAsset} from '../services/types'
import type {PublishedContentImages} from '../shared/shared_types'


export default {

    components: {SharedSlideshow},

    props: {
        content: {
            type: Object,
        },
    },

    setup(props:{content:PublishedContentImages}){

        // Injections
        const get_asset = inject<{value:GetAsset}>('get_asset')

        // Create ref for images
        const images = ref([])

        // Determine image format desired
        const asset_type = store.state.webp_supported ? 'webp' : 'jpeg'

        // Add object for each image
        for (const image_meta of props.content.images){
            const asset_id = image_meta[`asset_${asset_type}`]

            // Create reactive image object in structure slideshow expects
            const image = reactive({
                id: asset_id,  // Uniqueness is all that matters here
                data: null,
                caption: image_meta.caption,
            })

            // Add object now so order is kept, while waiting for asset download
            images.value.push(image)

            // Get the asset's data
            get_asset.value(asset_id).then(decrypted => {
                image.data = buffer_to_blob(decrypted, `image/${asset_type}`)
            }).catch(() => {})  // Will show placeholder if getting asset fails
        }


        // Fullscreen mode
        const fullscreen_img = ref(null)
        const fullscreen_img_style = computed(() => {
            return fullscreen_img.value && {'background-image': `url(${fullscreen_img.value})`}
        })
        const fullscreen_enable = (url:string) => {
            fullscreen_img.value = url
        }
        const fullscreen_disable = () => {
            fullscreen_img.value = null
        }


        // Disabling of page scroll
        const set_page_scroll = (value:boolean) => {
            // Set whether whole page can scroll or not (so can disable when image fullscreen)
            self.document.body.style.overflowY = value ? 'auto' : 'hidden'
        }
        watch(fullscreen_img, (value:string) => {
            set_page_scroll(!value)
        })
        onUnmounted(() => {
            // Ensure page can still scroll after component unmounted (in case done while fullscreen)
            set_page_scroll(true)
        })


        // Expose template's requirements
        return {images, fullscreen_img_style, fullscreen_enable, fullscreen_disable}
    },
}

</script>


<style lang='sass' scoped>

.fullscreen
    position: fixed
    z-index: 100
    top: 0
    bottom: 0
    left: 0
    right: 0
    background-color: black
    background-size: contain
    background-position: center
    background-repeat: no-repeat
    cursor: zoom-out

</style>

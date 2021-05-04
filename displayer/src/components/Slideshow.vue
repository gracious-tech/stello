
<template lang='pug'>

SharedSlideshow(:images='images' @img_click='fullscreen_enable' @displayed='on_displayed_change')

teleport(v-if='fullscreen_img_style' to='.content')
    div.fullscreen(@click='fullscreen_disable' :style='fullscreen_img_style')

</template>


<script lang='ts'>

import {ref, reactive, computed, watch, onUnmounted, inject, PropType, Ref} from 'vue'

import SharedSlideshow, {SlideshowImage} from '../shared/SharedSlideshow.vue'
import {store} from '../services/store'
import {buffer_to_blob} from '../services/utils/coding'
import {GetAsset} from '../services/types'
import type {PublishedContentImages} from '../shared/shared_types'


export default {

    components: {SharedSlideshow},

    props: {
        content: {
            type: Object as PropType<PublishedContentImages>,
            required: true,
        },
    },

    setup(props, {emit}){

        // Injections
        const get_asset = inject('get_asset') as Ref<GetAsset>

        // Create ref for images
        const images = ref<SlideshowImage[]>([])

        // Determine image format desired
        const asset_type = store.state.webp_supported ? 'webp' : 'jpeg'

        // Add object for each image
        for (const image_meta of props.content.images){

            // Determine the image's id
            // @ts-ignore v0.4.1 and less had `asset_webp` & `asset_jpeg` instead of `id`
            const image_id = image_meta.id ?? image_meta.asset_webp

            // Create reactive image object in structure slideshow expects
            const image = reactive({
                id: image_id,
                data: null,
                caption: image_meta.caption,
            } as SlideshowImage)

            // Add object now so order is kept, while waiting for asset download
            images.value.push(image)

            // Get the asset's data
            const asset_id = image_id + (asset_type === 'jpeg' ? 'j' : '')
            get_asset.value(asset_id).then(decrypted => {
                image.data = buffer_to_blob(decrypted, `image/${asset_type}`)
            }).catch(() => {})  // Will show placeholder if getting asset fails
        }


        // Fullscreen mode
        const fullscreen_img = ref<string|null>(null)
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
        watch(fullscreen_img, value => {
            set_page_scroll(!value)
        })
        onUnmounted(() => {
            // Ensure page can still scroll after component unmounted (in case done while fullscreen)
            set_page_scroll(true)
        })


        // Reporting of currently displayed image's id
        const on_displayed_change = (index:number) => {
            emit('displayed', images.value[index].id)
        }


        // Expose template's requirements
        return {images, fullscreen_img_style, fullscreen_enable, fullscreen_disable,
            on_displayed_change}
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


<template lang='pug'>

SharedHero(v-if='content.hero' :image='first_image' :theme_style='theme_style'
    :first='first_hero' :aspect='ratio')

SharedSlideshow(v-else :images='images' :aspect='ratio' @img_click='$emit("fullscreen")'
    @displayed='on_displayed_change')

</template>


<script lang='ts'>

import {ref, reactive, computed, PropType, defineComponent} from 'vue'

import SharedHero from '../shared/SharedHero.vue'
import SharedSlideshow from '../shared/SharedSlideshow.vue'
import {store} from '../services/store'
import {buffer_to_blob} from '../services/utils/coding'
import {displayer_config} from '@/services/displayer_config'
import type {PublishedContentImages} from '../shared/shared_types'


interface SlideshowImage {
    id:string
    data:Blob|null  // Null while still loading
    caption:string
}


export default defineComponent({

    components: {SharedSlideshow, SharedHero},

    props: {
        content: {
            type: Object as PropType<PublishedContentImages>,
            required: true,
        },
        first_hero: {
            type: Boolean,
            required: true,
        },
    },

    emits: {
        displayed: (value:string) => typeof value === 'string',
        fullscreen: () => true,
    },

    setup(props, {emit}){

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
            const image = reactive<SlideshowImage>({
                id: image_id,
                data: null,
                caption: image_meta.caption,
            })

            // Add object now so order is kept, while waiting for asset download
            images.value.push(image)

            // Get the asset's data
            const asset_id = image_id + (asset_type === 'jpeg' ? 'j' : '')
            void store.get_asset(asset_id).then(decrypted => {
                if (decrypted){
                    image.data = buffer_to_blob(decrypted, `image/${asset_type}`)
                }
            })
        }

        // Get aspect ratio from content metadata
        const ratio:[number, number] = [props.content.ratio_width, props.content.ratio_height]

        // Reporting of currently displayed image's id
        const on_displayed_change = (index:number) => {
            emit('displayed', images.value[index]!.id)
        }

        // Access to first image that assumes it exists (needed for TS)
        const first_image = computed(() => images.value[0]!)

        // Expose template's requirements
        return {
            images,
            first_image,
            on_displayed_change,
            ratio,
            theme_style: displayer_config.theme_style,
        }
    },
})

</script>


<style lang='sass' scoped>

</style>


<template lang='pug'>

SharedSlideshow(:images='images')

</template>


<script lang='ts'>

import {ref, reactive} from 'vue'

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
        get_asset: {
            type: Function,
        },
    },

    setup(props:{content:PublishedContentImages, get_asset:GetAsset}){

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
            props.get_asset(asset_id).then(decrypted => {
                image.data = buffer_to_blob(decrypted, `image/${asset_type}`)
            }).catch(() => {})  // Will show placeholder if getting asset fails
        }

        // Expose images ref
        return {images}
    }
}

</script>


<style lang='sass' scoped>

</style>

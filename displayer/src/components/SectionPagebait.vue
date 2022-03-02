
<template lang='pug'>

SharedPagebait(:button='button' :headline='headline' :desc='desc' :image='image' @click='open_page')

</template>


<script lang='ts'>

import {ref, inject, PropType, Ref, defineComponent, computed} from 'vue'

import SharedPagebait from '../shared/SharedPagebait.vue'
import {store} from '../services/store'
import {buffer_to_blob} from '../services/utils/coding'
import {GetAsset} from '../services/types'
import type {PublishedContentPage, PublishedSection} from '../shared/shared_types'


export default defineComponent({

    components: {SharedPagebait},

    props: {
        page: {
            type: Object as PropType<PublishedSection>,
            required: true,
        },
    },

    setup(props){

        // Unpack page prop for sake of type casting (can't do above due to MessageSection.vue use)
        const page = props.page as PublishedSection<PublishedContentPage>

        // Opening the page
        const current_page = inject('page') as Ref<PublishedSection<PublishedContentPage>|null>
        const open_page = () => {
            current_page.value = page
        }

        // Get image (if exists)
        const get_asset = inject('get_asset') as Ref<GetAsset>
        const image = ref<Blob|null>(null)
        if (page.content.image){
            const asset_type = store.state.webp_supported ? 'webp' : 'jpeg'
            const asset_id = page.content.image + (asset_type === 'jpeg' ? 'j' : '')
            void get_asset.value(asset_id).then(decrypted => {
                if (decrypted){
                    image.value = buffer_to_blob(decrypted, `image/${asset_type}`)
                }
            })
        }

        // Expose template's requirements
        const button = computed(() => page.content.button)
        const headline = computed(() => page.content.headline)
        const desc = computed(() => page.content.desc)
        return {button, headline, desc, image, open_page}
    },
})

</script>


<style lang='sass' scoped>

</style>

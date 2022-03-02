
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
            type: Object as PropType<PublishedSection<PublishedContentPage>>,
            required: true,
        },
    },

    setup(props){

        // Opening the page
        const current_page = inject('page') as Ref<PublishedSection<PublishedContentPage>|null>
        const open_page = () => {
            current_page.value = props.page
        }

        // Get image (if exists)
        const get_asset = inject('get_asset') as Ref<GetAsset>
        const image = ref<Blob|null>(null)
        if (props.page.content.image){
            const asset_type = store.state.webp_supported ? 'webp' : 'jpeg'
            const asset_id = props.page.content.image + (asset_type === 'jpeg' ? 'j' : '')
            void get_asset.value(asset_id).then(decrypted => {
                if (decrypted){
                    image.value = buffer_to_blob(decrypted, `image/${asset_type}`)
                }
            })
        }

        // Expose template's requirements
        const button = computed(() => props.page.content.button)
        const headline = computed(() => props.page.content.headline)
        const desc = computed(() => props.page.content.desc)
        return {button, headline, desc, image, open_page}
    },
})

</script>


<style lang='sass' scoped>

</style>

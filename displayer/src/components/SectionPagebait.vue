
<template lang='pug'>

SharedPagebait(:button='button' :headline='headline' :desc='desc' :image='image' @click='open_page')

</template>


<script lang='ts'>

import {ref, PropType, defineComponent, computed} from 'vue'

import SharedPagebait from '../shared/SharedPagebait.vue'
import {store} from '../services/store'
import {buffer_to_blob} from '../services/utils/coding'
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

        // Wrap page prop for sake of type casting (can't do above due to MessageSection.vue use)
        // WARN Can't just assign to props.page as would lose reactivity
        const page = computed(() => props.page as PublishedSection<PublishedContentPage>)

        // Opening the page
        const open_page = () => {
            store.change_page(page.value)
        }

        // Get image (if exists)
        const image = ref<Blob|null>(null)
        if (page.value.content.image){
            const asset_type = store.state.webp_supported ? 'webp' : 'jpeg'
            const asset_id = page.value.content.image + (asset_type === 'jpeg' ? 'j' : '')
            void store.get_asset(asset_id).then(decrypted => {
                if (decrypted){
                    image.value = buffer_to_blob(decrypted, `image/${asset_type}`)
                }
            })
        }

        // Expose template's requirements
        const button = computed(() => page.value.content.button)
        const headline = computed(() => page.value.content.headline)
        const desc = computed(() => page.value.content.desc)
        return {button, headline, desc, image, open_page}
    },
})

</script>


<style lang='sass' scoped>

</style>

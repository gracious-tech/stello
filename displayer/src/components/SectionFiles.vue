
<template lang='pug'>

div.root
    AppBtn(@click='click' :progress='downloading' :error='error' class='s-primary')
        SharedFilesIcon(:download='content.download')
        | {{ label || "Download" }}

</template>


<script lang='ts'>

import {PropType, defineComponent, ref} from 'vue'

import SharedFilesIcon from '@/shared/SharedFilesIcon.vue'
import {store} from '../services/store'
import {buffer_to_blob} from '../services/utils/coding'
import type {PublishedContentFiles} from '../shared/shared_types'


export default defineComponent({

    components: {SharedFilesIcon},

    props: {
        id: {
            type: String,
            required: true,
        },
        content: {
            type: Object as PropType<PublishedContentFiles>,
            required: true,
        },
    },

    setup(props){

        // State
        const downloading = ref(false)
        const error = ref(false)

        const click = async () => {

            // Reset state
            downloading.value = true
            error.value = false

            // Get the asset's data
            const decrypted = await store.get_asset(props.id)
            if (!decrypted){
                error.value = true
                downloading.value = false
                return
            }

            // Open/download file via detached <a>
            const blob = buffer_to_blob(decrypted, props.content.mimetype)
            const element = self.document.createElement('a')
            element.href = URL.createObjectURL(blob)  // Not revoking as causes bugs and not needed
            element.target = '_blank'
            if (props.content.download){
                element.download = props.content.filename
            }
            element.click()

            downloading.value = false
        }

        return {
            label: props.content.label,
            click,
            downloading,
            error,
        }
    },
})

</script>


<style lang='sass' scoped>

.root
    text-align: center

</style>

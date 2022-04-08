
<template lang='pug'>

div.root
    AppBtn(@click='click' :progress='downloading' :error='error' class='s-primary')
        svg.icon(viewBox='0 0 24 24')
            path(:d='icon')
        | {{ label || "Download" }}

</template>


<script lang='ts'>

import {PropType, defineComponent, ref, computed} from 'vue'

import {store} from '../services/store'
import {buffer_to_blob} from '../services/utils/coding'
import type {PublishedContentFiles} from '../shared/shared_types'


export default defineComponent({

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

        // Show different icon for download and open actions
        const icon = computed(() => {
            if (props.content.download){
                return 'M5,20h14v-2H5V20z M19,9h-4V3H9v6H5l7,7L19,9z'
            }
            return `M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9
                2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z`
        })

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
            element.href = URL.createObjectURL(blob)
            element.target = '_blank'
            if (props.content.download){
                element.download = props.content.filename
            }
            element.click()

            // Dereference blob so will be garbage collected after download
            // NOTE Also prevents downloading file after opening in a browser tab
            URL.revokeObjectURL(element.href)

            downloading.value = false
        }

        return {
            label: props.content.label,
            click,
            downloading,
            error,
            icon,
        }
    },
})

</script>


<style lang='sass' scoped>

.root
    text-align: center

</style>

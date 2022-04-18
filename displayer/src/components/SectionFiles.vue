
<template lang='pug'>

div.root
    AppBtn(@click='click' :progress='downloading' :error='error' class='s-primary')
        SharedFilesIcon(:download='content.download')
        | {{ label }}

</template>


<script lang='ts'>

import {PropType, defineComponent, ref, computed} from 'vue'

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
        const url = ref<string>()

        const label = computed(() => {
            // iOS sometimes doesn't allow virtual <a> click unless url already ready (not async)
            // So some iOS users will have to click twice, one to download and one to save/open
            // So indicate via the label when the file is ready to save/open
            if (url.value){
                return `Click to ${props.content.download ? "save" : "open"}`
            }
            return props.content.label || "Download"
        })

        const click = async () => {

            // Get the asset's data if haven't yet
            if (!url.value){
                error.value = false
                downloading.value = true
                const decrypted = await store.get_asset(props.id)
                downloading.value = false
                if (!decrypted){
                    error.value = true
                    return
                }
                // Give generic mimetype if requesting download so iOS 12 doesn't try open in tab
                // (iOS 12 doesn't support the download attribute)
                const mimetype =
                    props.content.download ? 'application/octet-stream' : props.content.mimetype
                const blob = buffer_to_blob(decrypted, mimetype)
                url.value = URL.createObjectURL(blob)  // NOTE Not revoking as causes bugs
            }

            // Save/open file via detached <a>
            // NOTE This won't work on iOS 12 (both download & open) or iOS 15 (open only)
            //      if file just downloaded as the download delay prevents further virtual click
            //      So user will need to click one more time in such cases
            const element = self.document.createElement('a')
            element.href = url.value
            if (props.content.download){
                element.download = props.content.filename
            } else {
                // WARN target='_blank' prevents download and open on iOS 12
                // Ironic but only using _blank if download attr is supported as will rule out ios12
                // NOTE Test not actually related to the download attr since opening not downloading
                if ('download' in element){
                    element.target = '_blank'
                }
            }
            element.click()
        }

        return {label, click, downloading, error}
    },
})

</script>


<style lang='sass' scoped>

.root
    text-align: center

</style>

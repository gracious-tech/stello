
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
                // Give generic mimetype if requesting download so iOS 12 doesn't display some types
                // (iOS 12 doesn't support the download attribute)
                const mimetype =
                    props.content.download ? 'application/octet-stream' : props.content.mimetype
                const blob = buffer_to_blob(decrypted, mimetype)
                url.value = URL.createObjectURL(blob)  // NOTE Not revoking as causes bugs
            }

            // Save/open file
            // WARN Must test across all browsers if ever change (including iOS Chrome/Safari)
            // There are two ways to trigger open/download of files: <a> and window.open
            // Both have pros+cons and behaviour across browsers and OS are complex (fun!)
            // In general, window.open works in more circumstances but can't name downloaded files
            // NOTE Following won't trigger on iOS 12 (both download & open) or iOS 15 (open only)
            //      if file just downloaded as the download delay prevents further nav/click
            //      So user will need to click one more time in such cases
            const element = self.document.createElement('a')
            if (props.content.download && 'download' in element){
                // Download attribute is supported so use that so can give file a name
                element.href = url.value
                element.download = props.content.filename
                element.click()
            } else {
                // window.open has better browser support than <a> for blob urls (esp. when _blank)
                self.open(url.value, '_blank')
            }
        }

        return {label, click, downloading, error}
    },
})

</script>


<style lang='sass' scoped>

.root
    text-align: center

</style>

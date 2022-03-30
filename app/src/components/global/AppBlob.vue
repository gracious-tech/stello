<!-- Display blobs directly via canvas

Useful for not having to create/revoke object urls

-->

<template lang='pug'>

canvas(v-if='blob' ref='canvas')

</template>


<script lang='ts'>

import {blob_to_bitmap} from '@/services/utils/coding'
import {Component, Vue, Prop, Watch} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({type: Blob, default: null}) declare readonly blob:Blob|null

    @Watch('blob', {immediate: true}) async watch_blob(){
        if (this.blob){
            const bitmap = await blob_to_bitmap(this.blob)
            const canvas = this.$refs['canvas'] as HTMLCanvasElement
            // Canvas may have disappeared if blob nulled while waiting on blob_to_bitmap
            if (canvas){
                canvas.width = bitmap.width
                canvas.height = bitmap.height
                canvas.getContext('bitmaprenderer')!.transferFromImageBitmap(bitmap)
            }
        }
    }

}

</script>

<!-- A dialog for choosing an image and crop region for it (suggestions optional) -->


<template lang='pug'>

v-card

    template(v-if='!image')

        v-card-title(class='d-flex flex-column align-center')
            div(class='mb-2') Choose Image
            div
                app-file(@input='upload' accept='image/*') From file
                app-btn(@click='paste') From copy/paste
                app-btn(v-if='removeable' @click='remove' class='error--text') Remove

        v-card-text.suggestions(v-if='suggestions.length' class='text-center')
            h1(class='text-subtitle-2 mb-2 text-left') From existing...
            img(v-for='image of suggestions_ui' :src='image.url' @click='image.choose')

        v-card-actions(class='d-flex flex-column')
            app-security-alert(v-if='invite') Image encrypted and expires with message
            app-btn(@click='dismiss' class='align-self-end') Cancel

    template(v-else)

        v-card-text(class='pt-6')
            image-edit-bar(:blob='image' :aspect='aspect' @changed='image_edited')
                app-blob.blob(:blob='image')

        v-card-actions
            app-btn(@click='dismiss') Cancel
            app-btn(@click='done' :disabled='!ready') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {bitmap_to_blob, blob_to_bitmap} from '@/services/utils/coding'
import {get_clipboard_blobs} from '@/services/utils/misc'
import {_tmp_normalize_orientation, resize_bitmap} from '@/services/utils/image'


@Component({})
export default class extends Vue {

    @Prop({type: Number, required: true}) declare readonly width:number  // max if no crop
    @Prop({type: Number, required: true}) declare readonly height:number  // max if no crop
    @Prop({type: Boolean, default: false}) declare readonly crop:boolean  // Force aspect ratio
    @Prop({type: Array, default: () => []}) declare readonly suggestions:Blob[]
    @Prop({type: Boolean, default: false}) declare readonly removeable:boolean
    @Prop({type: Boolean, default: false}) declare readonly invite:boolean  // Invite-image specific

    image:Blob|null = null
    have_edited = false

    get suggestions_ui():{url:string, choose():void}[]{
        return this.suggestions.map(blob => {
            return {
                url: URL.createObjectURL(blob),
                choose: () => this.handle_blob(blob),
            }
        })
    }

    get aspect(){
        // Whether aspect ratio is expected and what it is
        return this.crop ? this.width / this.height : undefined
    }

    get ready(){
        // Whether ready to emit final blob (must have edited once to crop if it's required)
        return this.image && (!this.crop || this.have_edited)
    }

    async handle_blob(blob:Blob){
        // Accept given blob if it's an image and begin editing

        // Ensure is an image
        try {
            blob = await _tmp_normalize_orientation(blob)  // TODO rm when bug fixed
            await blob_to_bitmap(blob)
        } catch {
            console.warn(`Not an image: ${blob.type}`)
            return false
        }

        this.image = blob
        return true
    }

    async upload(file:File){
        // Use file selected by the user
        if (! await this.handle_blob(file)){
            void this.$store.dispatch('show_snackbar', "Selected file was not an image")
        }
    }

    async paste():Promise<void>{
        // Get an image from clipboard
        for (const blob of await get_clipboard_blobs(['image/'])){
            if (await this.handle_blob(blob)){
                return  // Success
            }
        }
        void this.$store.dispatch('show_snackbar', "No image found (first copy an image)")
    }

    image_edited(blob:Blob){
        // Update image whenever edited
        this.have_edited = true
        this.image = blob
    }

    async done(){
        // Crop and resize based on the user's preference
        // WARN Never trust user crop as they can rotate image to again ruin aspect ratio
        let bitmap = await blob_to_bitmap(this.image!)
        bitmap = await resize_bitmap(bitmap, this.width, this.height, this.crop)

        // Emit as a blob
        const format = this.invite ? 'jpeg' : 'png'  // Many email clients only support jpeg
        this.$emit('close', await bitmap_to_blob(bitmap, format))
    }

    remove(){
        // Remove existing image by emitting null (rather than undefined)
        this.$emit('close', null)
    }

    dismiss(){
        // Emit undefined to do nothing
        this.$emit('close')
    }

}

</script>


<style lang='sass' scoped>

.v-card__title
    font-weight: normal !important  // Override for sake of security alert

.suggestions
    img
        display: inline-block
        vertical-align: middle
        margin: 12px
        width: 40%
        cursor: pointer

.blob, ::v-deep .croppr-container img
    width: 100%

</style>

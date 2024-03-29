
<template lang='pug'>

v-card

    v-card-title
        app-file(@input='add_files' :disabled='full' accept='image/*' multiple) Select image
        app-btn(@click='paste_images' :disabled='full') Paste image
        app-switch(v-if='images.length === 1' v-model='hero' label="Banner style")
        app-switch(v-else-if='images.length > 1' v-model='crop' label="Crop to same size")

    v-card-text
        dialog-section-images-item(v-for='(item, i) of images' :key='item.id' :section='section'
            :item_index='i' :theme_style_props='theme_style_props' :aspect='aspect')
        p.empty(v-if='!images.length') Select from your files or copy &amp; paste an image

    v-card-actions
        app-btn(@click='dismiss') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import DialogSectionImagesItem from './assets/DialogSectionImagesItem.vue'
import {_tmp_normalize_orientation, resize_bitmap, blob_image_size} from '@/services/utils/image'
import {generate_token} from '@/services/utils/crypt'
import {bitmap_to_blob, blob_to_bitmap} from '@/services/utils/coding'
import {get_clipboard_blobs} from '@/services/utils/misc'
import {SECTION_IMAGE_WIDTH} from '@/services/misc'
import {Section} from '@/services/database/sections'
import {ContentImages} from '@/services/database/types'


@Component({
    components: {DialogSectionImagesItem},
})
export default class extends Vue {

    @Prop({type: Section, required: true}) declare readonly section:Section<ContentImages>
    @Prop({type: Object, required: true}) declare readonly theme_style_props:Record<string, string>

    aspect = '1/1'

    get content(){
        return this.section.content
    }

    get images(){
        return this.content.images
    }

    get full(){
        // Whether the slideshow is full and no more images may be added
        // 8 is the max before buttons start to shrink size on mobile and half-width sections
        return this.content.images.length >= 8
    }

    get crop(){
        return this.content.crop
    }
    set crop(value){
        this.content.crop = value
        void self.app_db.sections.set(this.section)
    }

    get hero(){
        return this.content.hero
    }
    set hero(value){
        this.content.hero = value
        void self.app_db.sections.set(this.section)
    }

    async handle_blob(blob:Blob){
        // Handle a blob, resizing and adding if an image, otherwise returning false for failure

        // Ensure blob is an image
        let bitmap:ImageBitmap
        try {
            blob = await _tmp_normalize_orientation(blob)  // TODO rm once bug fixed
            bitmap = await blob_to_bitmap(blob)
        } catch {
            console.warn(`Not an image: ${blob.type}`)
            return false
        }

        // Resize the image, just to save space, as will resize again when publish message
        // Use double possible published width for both dimensions in case rotate or crop later
        bitmap = await resize_bitmap(bitmap, SECTION_IMAGE_WIDTH * 2, SECTION_IMAGE_WIDTH * 2)
        blob = await bitmap_to_blob(bitmap)

        // Add to images set
        this.images.push({
            id: generate_token(),
            data: blob,
            caption: '',
        })
        void self.app_db.sections.set(this.section)

        return true
    }

    async add_files(files:File[]){
        // Add files selected by the user
        const results = files.map(async file => this.handle_blob(file))
        // Warn if not all files processed successfully
        const all_added = (await Promise.all(results)).every(i => i)
        if (!all_added){
            void this.$store.dispatch('show_snackbar', "Some files could not be added")
        }
    }

    async paste_images(){
        // Add any images currently in clipboard, either as URLs or actual image data

        // Get clipboard data as list of blobs
        const blobs = await get_clipboard_blobs(['image/'])
        const results = blobs.map(blob => this.handle_blob(blob))

        // Wait till all have been processed and notify user if none succeeded
        const some_added = (await Promise.all(results)).some(i => i)
        if (!some_added){
            void this.$store.dispatch('show_snackbar', "No image found (first copy an image)")
        }
    }

    dismiss(){
        this.$emit('close')
    }

    @Watch('images.0.data', {immediate: true}) async watch_first_image(){
        // Recalculate aspect ratio for all images whenever first image changes
        if (this.images.length){
            const first_size = await blob_image_size(this.images[0]!.data)
            this.aspect = `${first_size.width}/${first_size.height}`
        } else {
            this.aspect = '1/1'
        }
    }

}

</script>


<style lang='sass' scoped>

.v-card__title
    display: flex
    align-items: center
    justify-content: space-around

.empty
    text-align: center

.app-switch
    margin-bottom: 0

</style>

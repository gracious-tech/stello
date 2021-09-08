
<template lang='pug'>

v-card

    v-card-title
        app-file(@input='add_files' accept='image/*' multiple) Select image
        app-btn(@click='paste_images') Paste image
        app-switch(v-model='crop' :disabled='images.length < 2' :disabled_value='false'
            label="Make same size")

    v-card-text
        dialog-section-images-item(v-for='(item, i) of images' :key='item.id' :section='section'
            :item_index='i')
        p.empty(v-if='!images.length') Select from your files or copy &amp; paste an image

    v-card-actions
        app-btn(@click='dismiss') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DialogSectionImagesItem from './assets/DialogSectionImagesItem.vue'
import {resize_bitmap} from '@/services/utils/image'
import {generate_token} from '@/services/utils/crypt'
import {request_blob} from '@/services/utils/http'
import {bitmap_to_canvas, canvas_to_blob} from '@/services/utils/coding'
import {get_clipboard_blobs} from '@/services/utils/misc'
import {SECTION_IMAGE_WIDTH} from '@/services/misc'
import {Section} from '@/services/database/sections'
import {ContentImages} from '@/services/database/types'


@Component({
    components: {DialogSectionImagesItem},
})
export default class extends Vue {

    @Prop() section:Section<ContentImages>

    get content(){
        return this.section.content
    }

    get images(){
        return this.content.images
    }

    get crop(){
        return this.content.crop
    }
    set crop(value){
        this.content.crop = value
        self._db.sections.set(this.section)
    }

    async handle_blob(blob:Blob){
        // Handle a blob, resizing and adding if an image, otherwise returning false for failure

        // If blob isn't an image, ignore it
        if (!blob.type.startsWith('image/')){
            console.warn(`Not an image: ${blob.type}`)
            return false
        }
        let bitmap:ImageBitmap
        try {
            bitmap = await createImageBitmap(blob)
        } catch (error){
            console.warn(error)
            return false
        }

        // Resize the image, just to save space, as will resize again when publish message
        // Double the possible output size in case crop later
        // TODO Reconsider what to do about height (not currently considered important)
        bitmap = await resize_bitmap(bitmap, SECTION_IMAGE_WIDTH * 2, SECTION_IMAGE_WIDTH * 2)
        blob = await canvas_to_blob(bitmap_to_canvas(bitmap))

        // Add to images set
        this.images.push({
            id: generate_token(),
            data: blob,
            caption: '',
        })
        self._db.sections.set(this.section)

        return true
    }

    async add_files(files){
        // Add files selected by the user
        const results = files.map(async file => this.handle_blob(file))
        // Warn if not all files processed successfully
        const all_added = (await Promise.all(results)).every(i => i)
        if (!all_added){
            this.$store.dispatch('show_snackbar', "Some files could not be added")
        }
    }

    async paste_images(){
        // Add any images currently in clipboard, either as URLs or actual image data

        // Get clipboard data as list of blobs
        const blobs = await get_clipboard_blobs(['image/', 'text/'])

        const results = blobs.map(async blob => {

            // If a text blob, see if it is a URL
            if (blob.type === 'text/plain'){
                const text = (await blob.text()).trim()
                if (text.startsWith('http://') || text.startsWith('https://')){
                    // Replace the blob with the URL's response
                    try {
                        blob = await request_blob(text)
                    } catch {
                        return false
                    }
                }
            }

            return this.handle_blob(blob)
        })

        // Wait till all have been processed and notify user if none succeeded
        const some_added = (await Promise.all(results)).some(i => i)
        if (!some_added){
            this.$store.dispatch('show_snackbar',
                "No image found (first copy an image or a link to one)")
        }
    }

    dismiss(){
        this.$emit('close')
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

</style>

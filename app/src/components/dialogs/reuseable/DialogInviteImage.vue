
<template lang='pug'>

v-card(class='pt-6')

    template(v-if='!image')

        v-card-title(class='pt-0 d-flex flex-column align-center')
            div(class='mb-2') Choose Invitation Image
            div
                app-file(@input='upload' accept='image/*') From file
                app-btn(@click='paste') From copy/paste

        v-card-text.suggestions(v-if='suggestions.length' class='text-center')
            h1(class='text-subtitle-2 mb-2 text-left') From message...
            img(v-for='image of suggestions_ui' :src='image.url' @click='image.choose')

        v-card-actions(class='d-flex flex-column')
            app-security-alert Image encrypted and expires with message
            app-btn(@click='dismiss' class='align-self-end') Cancel

    template(v-else)

        v-card-text(class='text-center')
            img(ref='chosen_img_element' :src='image_url')

        v-card-actions
            app-btn(@click='dismiss') Cancel
            app-btn(v-if='image' @click='done') Done

</template>


<script lang='ts'>

import Croppr from 'croppr'
import {Component, Vue, Prop} from 'vue-property-decorator'

import {request_blob} from '@/services/utils/http'
import {bitmap_to_canvas, canvas_to_blob} from '@/services/utils/coding'
import {get_clipboard_blobs} from '@/services/utils/misc'
import {INVITE_HTML_MAX_WIDTH} from '@/services/misc/invites'


@Component({})
export default class extends Vue {

    @Prop({type: Array, default: () => []}) suggestions:Blob[]

    image:Blob = null
    croppr:Croppr = null

    get image_url():string{
        return URL.createObjectURL(this.image)
    }

    get suggestions_ui():{url:string, choose():void}[]{
        return this.suggestions.map(blob => {
            return {
                url: URL.createObjectURL(blob),
                choose: () => this.handle_blob(blob),
            }
        })
    }

    async handle_blob(blob:Blob){
        // Handle a blob, adding if an image, otherwise returning false for failure

        // If blob isn't an image, ignore it
        if (!blob.type.startsWith('image/')){
            console.warn(`Not an image: ${blob.type}`)
            return false
        }
        try {
            await createImageBitmap(blob)
        } catch (error){
            console.warn(error)
            return false
        }

        // Can parse as an image, so set and init croppr
        this.image = blob
        this.$nextTick(() => {
            this.croppr = new Croppr(this.$refs.chosen_img_element as HTMLImageElement, {
                aspectRatio: 1 / 3,
            })
        })
        return true
    }

    async upload(file:File){
        // Use file selected by the user
        if (! await this.handle_blob(file)){
            this.$store.dispatch('show_snackbar', "Selected file was not an image")
        }
    }

    async paste(){
        // Get an image from clipboard
        for (let blob of await get_clipboard_blobs(['image/', 'text/'])){

            // If a text blob, see if it is a URL
            if (blob.type === 'text/plain'){
                const text = (await blob.text()).trim()
                if (text.startsWith('http://') || text.startsWith('https://')){
                    // Replace the blob with the URL's response
                    blob = await request_blob(text)
                }
            }

            if (await this.handle_blob(blob)){
                return  // Success
            }
        }

        // None succeeded, so tell user
        this.$store.dispatch('show_snackbar',
            "No image found (first copy an image or a link to one)")
    }

    async done(){
        // Crop and resize based on the user's preference
        const val = this.croppr.getValue()
        const output_width = INVITE_HTML_MAX_WIDTH * 2  // Even laptops now have DPR of 2+
        const bitmap = await createImageBitmap(this.image, val.x, val.y, val.width, val.height, {
            resizeQuality: 'high',
            resizeWidth: output_width,
            resizeHeight: output_width / 3,
        })

        // Emit as a jpeg blob
        const blob = await canvas_to_blob(bitmap_to_canvas(bitmap), 'jpeg')
        this.$emit('close', blob)
    }

    dismiss(){
        this.$emit('close')
    }

    beforeDestroy(){
        if (this.croppr){
            this.croppr.destroy()
        }
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

</style>

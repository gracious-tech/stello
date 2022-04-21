
<template lang='pug'>

div.root(:class='region_mode')

    div.menu

        template(v-if='region_mode')
            app-btn(v-if='!aspect || cropped' @click='reset_region' icon='close'
                color='error')
            app-btn(@click='submit_region' icon='done' color='accent')

        template(v-else)
            app-btn(@click='start_region("crop")' icon='crop' data-tip="Crop")
            app-btn(@click='rotate' icon='rotate_right' data-tip="Rotate")
            app-menu-more(icon='auto_awesome' data-tip="Filter")
                app-list-item(v-for='filter of filters' @click='change_filter(filter.value)'
                    :disabled='active_filter === filter.value') {{ filter.label }}
            app-btn(@click='start_region("redact")' icon='face_retouching_off' data-tip="Redact")
            app-btn(v-if='original !== blob' @click='undo' icon='undo' color='error'
                data-tip="Undo changes")

    //- Since Croppr only supports <img> (and replaces it) need to hide original img/canvas/etc
    slot(v-if='!region_mode')

    //- WARN Croppr tmp elements will be inserted here

</template>


<script lang='ts'>

import Croppr from 'dnm-croppr'
import {Component, Vue, Prop} from 'vue-property-decorator'

import {rotate_image, filter_image} from '@/services/utils/image'
import {bitmap_to_2dcanvas, blob_to_bitmap, canvas_to_blob} from '@/services/utils/coding'


@Component({})
export default class extends Vue {

    @Prop({type: Blob, required: true}) declare readonly blob:Blob
    @Prop({type: Number, default: undefined}) declare readonly aspect:number|undefined

    declare original:Blob  // Will be set during created hook

    unfiltered:OffscreenCanvas|null = null
    active_filter:string|null = null
    region_mode:'crop'|'redact'|null = null
    croppr:Croppr|null = null
    cropped = false  // Whether have cropped yet (only relevant if aspect ratio given)

    created(){
        // Keep reference to original blob so can reset back to it
        this.original = this.blob
        // Trigger creation of canvas
        void this.reset()
    }

    mounted(){
        // If enforcing an aspect ratio, display crop tool upon load
        // NOTE Initial crop will become the "original" so can't undo it back to a wrong ratio
        if (this.aspect){
            this.start_region('crop')
        }
    }

    get filters(){
        // Available filters (only one active at a time)
        return [
            {label: "None", value: null},
            {label: "Enhanced", value: 'contrast(120%)'},
            {label: "Vibrant", value: 'saturate(150%) brightness(130%)'},
            {label: "Vintage", value: 'sepia(80%) saturate(120%) brightness(80%)'},
            {label: "Black & White", value: 'grayscale(100%) contrast(110%) brightness(80%)'},
        ]
    }

    async reset(){
        // Reset editing by reverting to original blob and removing any filter
        this.active_filter = null
        this.unfiltered = bitmap_to_2dcanvas(await blob_to_bitmap(this.original))
    }

    start_region(mode:'crop'|'redact'){
        // Start a region tool (either crop or redact)
        this.region_mode = mode

        // Create tmp img to pass to Croppr since it expects an img attached to DOM (later delete)
        // WARN Mustn't reuse target as Croppr doesn't remove event listeners properly and will fail
        const target = self.document.createElement('img')
        target.src = URL.createObjectURL(this.blob)
        target.classList.add('croppr-target')
        this.$el.appendChild(target)

        // Init croppr
        if (mode === 'redact'){
            // Start as smallish (15%) offset (avoid middle confirm buttons) square region
            const redact_box_size = Math.round(this.unfiltered!.width / 100 * 15)  // 15%
            this.croppr = new Croppr(target, {
                startSize: [redact_box_size, redact_box_size, 'real'],
                startPosition: [0.2, 0.2],  // Don't start under accept/cancel buttons in middle
            })
        } else {
            // If locked to an aspect use that, otherwise make initial selection 80% of whole
            this.croppr = new Croppr(target, {
                startSize: this.aspect ? undefined : [0.8, 0.8],
                aspectRatio: this.aspect,
            })
        }
    }

    reset_region(){
        // Disable region tool
        this.region_mode = null

        // Destroy Croppr instance
        this.croppr!.destroy()
        this.croppr = null

        // Delete the tmp target and blob url created for Croppr (since only accepts img elements)
        const target = this.$el.querySelector('.croppr-target') as HTMLImageElement
        URL.revokeObjectURL(target.src)
        this.$el.removeChild(target)
    }

    submit_region(){
        // Accept the current region

        // Confirm if have ever cropped (relevant for when enforcing aspect ratio)
        if (this.region_mode === 'crop'){
            this.cropped = true
        }

        // Preserve region coordinates and mode before reseting
        const region = this.croppr!.getValue()
        const region_mode = this.region_mode
        this.reset_region()

        // Update the image
        void this.update_image(canvas => {

            // Create new canvas that is just the selected region
            const img_data = canvas.getContext('2d')!.getImageData(
                region.x, region.y, region.width, region.height)
            const region_canvas = new OffscreenCanvas(img_data.width, img_data.height)
            region_canvas.getContext('2d')!.putImageData(img_data, 0, 0)

            if (region_mode === 'redact'){
                // Blur region and put back in original canvas

                // Draw the region onto another canvas with greatly reduced size
                /* NOTE No matter what image resolution is, reduce it to an image of 30 pixels
                        Such that redaction has same effect whether high res or very high res photo
                        Either the height or width will be reduced to 30 pixels (which ever longer)
                            And then the other dimension is relative to the larger
                            So that can't exceed 30 pixels and redacted area pixels look square
                */
                const largest_side = canvas.width > canvas.height ? canvas.width : canvas.height
                const reduced_width = Math.round(region.width / largest_side * 30)
                const reduced_height = Math.round(region.height / largest_side * 30)
                const reduced_region = new OffscreenCanvas(reduced_width, reduced_height)
                // Decrease contrast to make colors slightly less distinct
                reduced_region.getContext('2d')!.filter = 'contrast(80%)'
                reduced_region.getContext('2d')!.drawImage(
                    region_canvas, 0, 0, reduced_width, reduced_height)

                // Draw again onto a larger canvas
                // So that final non-smooth/pixelated draw will have more/smaller pixels/squares
                // NOTE While this region will be 60 pixels it will only have the data of 30 pixels
                const reduced_region2 = new OffscreenCanvas(reduced_width*2, reduced_height*2)
                reduced_region2.getContext('2d')!.drawImage(
                    reduced_region, 0, 0, reduced_width*2, reduced_height*2)

                // Draw region back onto original canvas without smoothing (pixelated)
                canvas.getContext('2d')!.imageSmoothingEnabled = false
                canvas.getContext('2d')!.drawImage(
                    reduced_region2, region.x, region.y, region.width, region.height)
                canvas.getContext('2d')!.imageSmoothingEnabled = true
                return canvas

            } else {
                // Return the new region canvas
                return region_canvas
            }
        })
    }

    async rotate(){
        // Rotate the image 90deg clockwise
        await this.update_image(rotate_image)
        if (this.aspect){
            // Enforcing aspect ratio so prompt to crop again
            // Not setting `this.cropped = false` so user can rotate again before crop if needed
            this.start_region('crop')
        }
    }

    change_filter(filter:string|null){
        // Change the active filter
        this.active_filter = filter
        // Force update without any effects as filter is applied within `update_image` itself
        void this.update_image(canvas=>canvas)
    }

    async update_image(method:(canvas:OffscreenCanvas)=>OffscreenCanvas){
        // Update and emit image as blob, taking an update fn

        // Apply the update to unfiltered copy (so filter can change without layering filters)
        this.unfiltered = method(this.unfiltered!)

        // Created filtered version (that isn't preserved)
        let filtered = this.unfiltered
        if (this.active_filter){
            filtered = filter_image(this.unfiltered, this.active_filter)
        }

        // Emit as a blob
        this.$emit('changed', await canvas_to_blob(filtered))
    }

    async undo(){
        // Undo all changes by emitting original and resetting
        this.$emit('changed', this.original)
        void this.reset()
    }
}

</script>


<style lang='sass' scoped>

.root

    // Default to displaying top elements over each other (menu and image)
    display: grid
    // WARN `justify-content: center` here will mess up svg width
    ::v-deep > *
        grid-area: 1/1

    .menu
        visibility: hidden
        opacity: 0.5
        background-color: rgba(black, 0.7)
        border-radius: 24px
        margin: 12px
        z-index: 10  // Appear over Croppr
        align-self: start
        justify-self: start

        &:hover
            opacity: 1

    &.crop, &.redact
        // Region menu always visible and centered
        .menu
            visibility: visible
            opacity: 1
            align-self: center
            justify-self: center

    &.redact ::v-deep
        // Make region red tinged instead of excluded area darkening (as with crop)
        .croppr-overlay
            background-color: transparent
        .croppr-region
            outline: 1px solid red
            background-color: rgba(red, 0.2)

    &:hover
        .menu
            visibility: visible

    &:focus-within
        // When choosing a filter from menu dropdown
        .menu
            visibility: visible
            opacity: 1

</style>

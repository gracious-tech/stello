
<template lang='pug'>

div.root(:class='{multiple}')

    div.slideshow(:class='{editing}')
        svg.aspect(:viewBox='aspect_svg_viewbox')
        div.scroller(ref='scroller' @scroll='event => recalc_current()')
            div.item(v-for='styles of images_ui' :style='styles')
                div.buttons(@click.self='$emit("img_click")')
                    div.prev(v-if='multiple' @click='prev')
                    div.next(v-if='multiple' @click='next')

    div.thumbs(v-if='multiple')
        div.thumb(v-for='(button, i) of buttons' :key='button.id' :class='{active: current === i}')
            button(@click.stop='button.activate' :style='button.style')

    div.cap(v-if='caption') {{ caption }}

</template>


<script lang='ts'>

import type {PropType} from 'vue'  // Importing just as type should still keep compatible with Vue 2


export interface SlideshowImage {
    id:string
    data:Blob|null  // Null while still loading
    caption:string
}


// Generate a placeholder image
const PLACEHOLDER = URL.createObjectURL(
    new Blob(
        [`
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="24" viewBox="0 0 48 24">
            <path d="M0 0h48v24H0z" fill="#55555522"/>
            <path fill="#55555533" d="
                m14 4c-1.1 0-2.2157 0.92136-2 2v5h1v-5c0-0.4714 0.5286-1 1-1h9v-1zm11 0v1h9c0.4714
                0 1.0924 0.53775 1 1v5h1v-5c0-1.1-0.9-2-2-2zm2.5 4c-0.83 0-1.5 0.67-1.5 1.5s0.67
                1.5 1.5 1.5 1.5-0.67 1.5-1.5-0.67-1.5-1.5-1.5zm-6.5 2-5 6h16l-4-4-3.0293 2.7109zm-9
                3v5c0 1.1 0.9 2 2 2h9v-1h-9c-0.4714 0-1.0924-0.53775-1-1v-5zm23 0v5c0 0.4714-0.5286
                1-1 1h-9v1h9c1.1 0 2-0.9 2-2v-5z
            "/>
        </svg>
        `],
        {type: 'image/svg+xml'},
    ),
)


export default {

    props: {
        images: {
            type: Array as PropType<SlideshowImage[]>,
            required: true,
        },
        aspect: {
            type: Array as unknown as PropType<[number, number]>|null,
        },
        crop: {
            type: Boolean,
            default: false,  // Not needed in displayer (crop already applied)
        },
        editing: {
            type: Boolean,
            default: false,  // Whether using slideshow in message editor or displayer
        },
    },

    inject: {
        fullscreen: {default: null},  // Not used in editor
    },

    data(){
        return {
            current: 0,
            object_urls: {} as Record<string, string>,  // Caches object urls to avoid recreating
        }
    },

    computed: {

        aspect_svg_viewbox():string{
            // The viewbox for the svg that will maintain the correct aspect ratio
            // NOTE grid used to place images on top of the invisible svg
            if (this.aspect)
                return `0 0 ${this.aspect[0]} ${this.aspect[1]}`
            return '0 0 48 24'  // Placeholder's size
        },

        images_ui():Record<string, string>[]{
            // Get UI view of images that returns styles for their display
            if (this.empty){
                return [{
                    'background-image': `url(${PLACEHOLDER})`,
                    'background-size': 'cover',
                }]
            }
            return this.images.map(image => {
                const url = this.object_urls[image.id]
                return {
                    'background-image': `url(${url})`,
                    'background-size': this.crop || url === PLACEHOLDER ? 'cover' : 'contain',
                }
            })
        },

        empty():boolean{
            // Whether no images exist for the slideshow
            return this.images.length === 0
        },

        multiple():boolean{
            // Whether there is more than one image
            return this.images.length > 1
        },

        caption():string|null{
            // Get caption for current image
            if (this.empty){
                // No images added, must be in editor, so display help text
                return "No images added yet"
            }
            if (!this.captions_exist){
                // No images have captions so don't leave space for them
                return null
            }
            // Return current caption, or otherwise a non-breaking space to reduce layout jumping
            return this.images[this.current]?.caption.trim() || "\u00A0"
        },

        captions_exist():boolean{
            // Whether at least one image has a caption (and should .'. make room for it)
            return this.images.some(image => image.caption.trim())
        },

        buttons():{id:string, style:Record<string, string>, activate:()=>void}[]{
            // UI data for buttons for navigating to specific images
            return this.images.map((image, i) => {
                return {
                    id: image.id,
                    style: {'background-image': `url(${this.object_urls[image.id]})`},
                    activate: () => {this.change_current(i)},
                }
            })
        },

        is_first():boolean{
            return this.current === 0
        },

        is_last():boolean{
            return this.current >= this.images.length - 1
        },
    },

    watch: {

        current: {
            immediate: true,
            handler(value:number){
                // Emit current index whenever it changes
                this.$emit('displayed', value)
            },
        },

        images: {
            immediate: true,
            deep: true,
            handler(images:SlideshowImage[]){
                // Create object URLs for images whenever their data becomes available
                // WARN Assumes image data doesn't change (aside from a null -> blob)
                const new_object_urls:Record<string, string> = {}
                for (const image of images){
                    if (image.id in this.object_urls && this.object_urls[image.id] !== PLACEHOLDER){
                        // URL already created for this image, so reuse to reduce memory usage
                        new_object_urls[image.id] = this.object_urls[image.id]
                    } else if (image.data){
                        // Data only now available, so create URL
                        new_object_urls[image.id] = URL.createObjectURL(image.data)
                    } else {
                        // Still waiting on data, so display placeholder
                        new_object_urls[image.id] = PLACEHOLDER
                    }
                }
                this.object_urls = new_object_urls
            },
        },

        'fullscreen.value': {  // NOTE Not used in editor (a Vue 3 ref)
            handler(){
                // When go fullscreen, teleport causes scroll to lose position, so reposition it
                this.$nextTick(() => {
                    const div = this.$refs.scroller as HTMLDivElement
                    div.scrollTo({
                        left: (div.scrollWidth / this.images.length) * this.current,
                    })
                })
            },
        },
    },

    methods: {

        recalc_current():void{
            // Determine which image is currently being shown whenever scroll changes
            // WARN Scroll events emitted very rapidly, so keep lightweight
            // NOTE Not debouncing since performance ok, and much smoother when no debounce
            const target = this.$refs.scroller as HTMLDivElement
            const item_width = target.scrollWidth / this.images.length
            this.current = Math.round(target.scrollLeft / item_width)
        },

        change_current(i:number):void{
            // Change current image by scrolling to the desired one
            if (this.$refs.scroller){  // Ensure mounted
                const div = this.$refs.scroller as HTMLDivElement
                div.scrollTo({
                    left: (div.scrollWidth / this.images.length) * i,
                    behavior: 'smooth',
                })
            }
        },

        prev(){
            // Change to prev image (loops)
            this.change_current(this.is_first ? this.images.length - 1 : this.current - 1)
        },

        next(){
            // Change to next image (loops)
            this.change_current(this.is_last ? 0 : this.current + 1)
        },
    },

}

</script>


<style lang='sass' scoped>


.root
    // Display flex so can make slideshow div smaller when not enough height and not lose buttons
    display: flex
    flex-direction: column

    &.multiple
        .slideshow
            // Make bg black when multiple, otherwise edge hover looks weird
            // NOTE Don't apply when single image so can use transparency for single images
            background-color: black


.slideshow

    // Hack that uses an svg and overlapping grid columns to force an aspect ratio
    // See https://stackoverflow.com/a/53245657/10262211
    display: grid
    position: relative
    overflow-y: hidden
    .aspect, .scroller
        grid-area: 1/1
        width: 100%

    // Curve corners of slideshow
    border-radius: 12px

    // Image click in displayer is zoom, but edit in editor
    cursor: zoom-in
    &.editing
        cursor: pointer

    .scroller
        // A container for images that scrolls horizontally, wide enough only for one at a time
        position: absolute  // Part of aspect ratio hack and shrinking height when fullscreen
        display: flex
        height: 100%  // WARN Do not set height on .aspect (no idea why)
        overflow-y: hidden
        overflow-x: scroll
        scroll-snap-type: x mandatory

        .item
            scroll-snap-align: start
            display: inline-block
            min-width: 100%
            background-position: center
            background-repeat: no-repeat

        // Hide scrollbar as rely on buttons/swipe instead
        scrollbar-width: none
        &::-webkit-scrollbar
            display: none


.buttons
    // The visible prev/next clickable areas that sit over images
    position: absolute
    display: flex
    justify-content: space-between
    height: 100%
    width: 100%

    .prev, .next
        height: 100%
        width: 30%
        cursor: pointer

    .prev:hover
        border-left: 2px solid #0088ff

    .next:hover
        border-right: 2px solid #0088ff


.thumbs
    // Image preview circles that go to specific images
    display: flex
    justify-content: center
    padding-top: 10px

    .thumb
        display: flex
        width: 100%
        max-width: 30px
        max-height: 30px
        margin: 0 6px

        &.active
            button
                filter: brightness(50%)
                cursor: default

        button
            width: 100%
            height: 0
            padding-bottom: 100%
            border-radius: 50%
            border-style: none
            background-size: cover
            background-position: center

            &:focus
                outline-style: none


.cap  // Avoid Vuetify's caption class
    text-align: center
    opacity: 0.6
    font-size: 0.75em
    line-height: 1.2  // Minimize distance from wrapped text
    padding-top: 10px


</style>

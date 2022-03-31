
<template lang='pug'>

div.root(:class='{multiple}')

    div.slideshow
        svg.aspect(:viewBox='aspect_svg_viewbox')
        div.scroller(ref='scroller' @scroll='event => recalc_current()')
            div.item(v-for='style of images_ui' :data-image='style.image' :class='style.size_class')
                div.buttons(@click.self='$emit("img_click")')
                    div.prev(v-if='multiple' @click='prev')
                    div.next(v-if='multiple' @click='next')

    div.thumbs(v-if='multiple')
        div.thumb(v-for='(button, i) of buttons' :key='button.id' :class='{active: current === i}')
            button(@click.stop='button.activate' :data-image='button.image')

    div.cap
        div(v-for='(caption, i) of captions' v-show='caption' :class='{active: current === i}')
            | {{ caption }}

</template>


<script lang='ts'>

import {defineComponent} from 'vue-demi'
import type {PropType} from 'vue'  // Importing just as type should still keep compatible with Vue 2

import {enforce_range} from '@/services/utils/numbers'


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


export default defineComponent({

    inject: {
        fullscreen: {default: null},  // Not used in editor
    },

    props: {
        images: {
            type: Array as PropType<SlideshowImage[]>,
            required: true,
        },
        aspect: {
            type: Array as unknown as PropType<[number, number]>|null,
            default: null,
        },
        crop: {
            type: Boolean,
            default: false,  // Not needed in displayer (crop already applied)
        },
    },

    emits: ['displayed', 'img_click'],

    data(){
        return {
            current: 0,
            object_urls: {} as Record<string, {blob:Blob, url:string}>,  // Cache of blob URLs
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

        images_ui():{image:string, size_class:string}[]{
            // Get UI view of images that returns styles for their display
            if (this.empty){
                return [{
                    image: `url(${PLACEHOLDER})`,
                    size_class: 'cover',
                }]
            }
            return this.images.map(image => {
                const url = this.object_urls[image.id]?.url || PLACEHOLDER
                return {
                    image: `url(${url})`,
                    size_class: this.crop || url === PLACEHOLDER ? 'cover' : 'contain',
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

        captions():string[]{
            // All captions as a list
            if (this.empty){
                // No images added, must be in editor, so display help text
                return ["No images added yet"]
            }
            return this.images.map(item => item.caption?.trim())
        },

        buttons():{id:string, image:string, activate:()=>void}[]{
            // UI data for buttons for navigating to specific images
            return this.images.map((image, i) => {
                return {
                    id: image.id,
                    image: `url(${this.object_urls[image.id]?.url || PLACEHOLDER})`,
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
        // WARN vue-tsc gets confused if handler's args used (instead access values via this.prop)

        current: {
            immediate: true,
            handler(){
                // Emit current index whenever it changes
                this.$emit('displayed', this.current)
            },
        },

        images: {
            immediate: true,
            deep: true,
            handler(){
                // Create object URLs for images whenever their data becomes available
                // WARN Never store PLACEHOLDER in object_urls as would get revoked when unmounted
                const new_object_urls:Record<string, {blob:Blob, url:string}> = {}
                for (const image of this.images){
                    if (image.data){
                        if (image.data === this.object_urls[image.id]?.blob){
                            // Already have a URL for this blob (hasn't changed)
                            new_object_urls[image.id] = this.object_urls[image.id]!
                        } else {
                            new_object_urls[image.id] = {
                                blob: image.data,
                                url: URL.createObjectURL(image.data),
                            }
                        }
                    }
                }

                // Revoke old urls before replacing cache
                for (const image_id in this.object_urls){
                    if (! (image_id in new_object_urls)){
                        URL.revokeObjectURL(this.object_urls[image_id]!.url)
                    }
                }
                this.object_urls = new_object_urls

                // Once items available in DOM, apply bg image (done via JS due to CSP)
                void this.$nextTick(() => {
                    const el = this.$el as HTMLDivElement
                    for (const item of el.querySelectorAll<HTMLElement>('[data-image]')){
                        item.style.backgroundImage = item.dataset['image']!
                    }
                })
            },
        },

        'fullscreen.value': {  // NOTE Not used in editor (a Vue 3 ref)
            handler(){
                // When go fullscreen, teleport causes scroll to lose position, so reposition it
                void this.$nextTick(() => {
                    const div = this.$refs['scroller'] as HTMLDivElement
                    div.scrollTo({
                        left: (div.scrollWidth / this.images.length) * this.current,
                    })
                })
            },
        },
    },

    destroyed(){  // eslint-disable-line vue/no-deprecated-destroyed-lifecycle -- Vue 2
        this.revoke_urls()
    },

    unmounted(){  // Vue 3
        this.revoke_urls()
    },

    methods: {

        recalc_current():void{
            // Determine which image is currently being shown whenever scroll changes
            // WARN Scroll events emitted very rapidly, so keep lightweight
            // NOTE Not debouncing since performance ok, and much smoother when no debounce
            const target = this.$refs['scroller'] as HTMLDivElement
            if (!target){
                return  // Component probably being destroyed (avoid triggering error report)
            }
            const item_width = target.scrollWidth / this.images.length
            const proposed = Math.round(target.scrollLeft / item_width)
            // Ensure value is valid (e.g. could get errors if changing while resizing window)
            this.current = enforce_range(proposed, 0, this.images.length - 1)
        },

        change_current(i:number):void{
            // Change current image by scrolling to the desired one
            if (this.$refs['scroller']){  // Ensure mounted
                const div = this.$refs['scroller'] as HTMLDivElement
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

        revoke_urls(){
            // Revoke all blob URLs that were created
            for (const item of Object.values(this.object_urls)){
                URL.revokeObjectURL(item.url)
            }
        },
    },

})

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
    border-radius: var(--stello-radius)

    // Image click in displayer is zoom (edit in editor which will override cursor)
    cursor: zoom-in

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
            &.cover
                background-size: cover
            &.contain
                background-size: contain

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
        border-left: 2px solid var(--stello-hue)

    .next:hover
        border-right: 2px solid var(--stello-hue)


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
            cursor: pointer

            &:focus
                outline-style: none


.cap  // Avoid Vuetify's caption class
    display: grid

    > div
        grid-area: 1/1  // Place on top of each other
        text-align: center
        opacity: 0.6
        font-size: 0.75em
        line-height: 1.2  // Minimize distance from wrapped text
        padding-top: 10px
        overflow: hidden  // Triggers word wrap

        &:not(.active)
            visibility: hidden


</style>

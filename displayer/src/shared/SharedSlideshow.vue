
<!-- TODO
    1. Switch to display via horizontal snap scrolling div (so touch users can smoothly swipe)
    2. Replace prev/next buttons with hover over left/right of image
        Show shadow/light at edge of image on hover (so doesn't block viewing of image edge)
-->

<template lang='pug'>

div

    div.displayer(:class='{editing}' :style='current_style' @click.stop='handle_img_click')
        img.sizer(:src='first_src')

    div.buttons(v-if='images.length > 1')
        button(@click.stop='prev' class='step')
            svg(width='24' height='24')
                path(d='M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z')
        button(v-for='(button, i) of buttons' :key='button.id' @click.stop='button.activate'
            :style='button.style' class='thumb' :class='{active: current === i}')
        button(@click.stop='next' class='step')
            svg(width='24' height='24')
                path(d='M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z')

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
        crop: {
            type: Boolean,
            default: false,  // Not needed in displayer (crop already applied)
        },
        editing: {
            type: Boolean,
            default: false,  // Whether using slideshow in message editor or displayer
        },
    },

    data(){
        return {
            current: 0,
            placeholder: null as null|string,
        }
    },

    computed: {

        object_urls():string[]{
            return this.images.map(image =>
                image.data ? URL.createObjectURL(image.data) : PLACEHOLDER)
        },

        empty():boolean{
            return this.images.length === 0
        },

        first_src():string{
            return this.empty ? PLACEHOLDER : this.object_urls[0]
        },

        current_url():string{
            return this.empty ? PLACEHOLDER : this.object_urls[this.current]
        },

        current_style():Record<string, string>{
            return {
                'background-image': `url(${this.current_url})`,
                'background-size': this.crop ? 'cover' : 'contain',
            }
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
            return this.images[this.current].caption.trim() || "\u00A0"
        },

        captions_exist():boolean{
            // Whether at least one image has a caption (and should .'. make room for it)
            return this.images.some(image => image.caption.trim())
        },

        buttons():{id:string, style:Record<string, string>, activate:()=>void}[]{
            return this.images.map((image, i) => {
                return {
                    id: image.id,
                    style: {'background-image': `url(${this.object_urls[i]})`},
                    activate: () => {this.current = i},
                }
            })
        },

        is_first():boolean{
            return this.current === 0
        },

        is_last():boolean{
            return this.current === this.images.length - 1
        },
    },

    methods: {

        prev(){
            this.current = this.is_first ? this.images.length - 1 : this.current - 1
        },

        next(){
            this.current = this.is_last ? 0 : this.current + 1
        },

        handle_img_click(){
            // Pass event to parent for custom behaviour
            this.$emit('img_click', this.current_url)
        },
    },

}

</script>


<style lang='sass' scoped>


.sizer
    width: 100%
    position: relative
    left: -99999px


.displayer
    cursor: zoom-in
    background-position: center
    background-repeat: no-repeat
    border-radius: 12px

    &.editing
        cursor: pointer


.buttons
    display: flex
    justify-content: center
    padding-top: 10px

    button
        display: flex
        justify-content: center
        align-items: center
        width: 30px
        height: 30px
        border-radius: 15px
        border-style: none
        margin: 0 6px
        background-color: transparent
        background-size: cover
        background-position: center
        cursor: pointer

        &:focus
            outline-style: none

        &.step
            fill: currentColor
            &:disabled
                opacity: 0.25 !important
            &:not(:hover)
                opacity: 0.5

        &.thumb
            &:not(.active)
                opacity: 0.5
            &:hover
                background-color: rgba(50%, 50%, 50%)


.cap  // Avoid Vuetify's caption class
    text-align: center
    opacity: 0.6
    font-size: 0.75em
    line-height: 1.2  // Minimize distance from wrapped text
    padding-top: 10px


</style>

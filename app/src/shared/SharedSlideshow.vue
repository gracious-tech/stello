
<template lang='pug'>

div(@click='bg_click')

    div.displayer(:class='{zoom, editing}' :style='current_style' @click.stop='handle_img_click')
        img.sizer(:src='first_src')

    div.buttons(v-if='images.length > 1')
        button(@click.stop='prev' :disabled='is_first' class='step')
            svg(width='24' height='24')
                path(d='M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z')
        button(v-for='(button, i) of buttons' :key='button.id' @click.stop='button.activate'
            :style='button.style' class='thumb' :class='{active: current === i}')
        button(@click.stop='next' :disabled='is_last' class='step')
            svg(width='24' height='24')
                path(d='M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z')

    //- NOTE \u00A0 is a non-breaking space (&nbsp; didn't work for some reason)
    div.cap {{ caption || "\u00A0" }}

</template>


<script lang='ts'>

export default {

    props: {
        images: {
            type: Array,
        },
        crop: {
            type: Boolean,
            default: false,  // Important not to when zooming in displayer (crop already applied)
        },
        editing: {
            type: Boolean,
            default: false,  // Whether using slideshow in message editor or displayer
        },
    },

    data(){
        return {
            current: 0,
            zoom: false,
            placeholder: null,
        }
    },

    created(){
        // Generate a placeholder image
        const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24">
            <path d="M0 0h24v24H0z" fill="#77777722"/>
            <path fill="#00000022" d="M4 4h7V2H4c-1.1 0-2 .9-2 2v7h2V4zm6 9l-4 5h12l-3-4-2.03 2.71L10 13zm7-4.5c0-.83-.67-1.5-1.5-1.5S14 7.67 14 8.5s.67 1.5 1.5 1.5S17 9.33 17 8.5zM20 2h-7v2h7v7h2V4c0-1.1-.9-2-2-2zm0 18h-7v2h7c1.1 0 2-.9 2-2v-7h-2v7zM4 13H2v7c0 1.1.9 2 2 2h7v-2H4v-7z"/>
        </svg>`
        const blob = new Blob([svg], {type: 'image/svg+xml'})
        this.placeholder = URL.createObjectURL(blob)
    },

    // Ensure page can still scroll after component unmounted (in case done while zooming)
    destroyed(){  // Vue 2
        this.set_page_scroll(true)
    },
    unmounted(){  // Vue 3
        this.set_page_scroll(true)
    },

    computed: {

        object_urls(){
            return this.images.map(image =>
                image.data ? URL.createObjectURL(image.data) : this.placeholder)
        },

        empty(){
            return this.images.length === 0
        },

        first_src(){
            return this.empty ? this.placeholder : this.object_urls[0]
        },

        current_style(){
            const url = this.empty ? this.placeholder : this.object_urls[this.current]
            return {
                'background-image': `url(${url})`,
                'background-size': this.crop ? 'cover' : 'contain',
            }
        },

        caption(){
            return this.empty ? "No images added yet" : this.images[this.current].caption
        },

        buttons(){
            return this.images.map((image, i) => {
                return {
                    id: image.id,
                    style: {'background-image': `url(${this.object_urls[i]})`},
                    activate: () => {this.current = i},
                }
            })
        },

        is_first(){
            return this.current === 0
        },

        is_last(){
            return this.current === this.images.length - 1
        },
    },

    watch: {
        zoom(){
            // Disable page scroll while zooming
            this.set_page_scroll(!this.zoom)
        },
    },

    methods: {

        prev(){
            if (!this.is_first){
                this.current -= 1
            }
        },

        next(){
            if (!this.is_last){
                this.current += 1
            }
        },

        handle_img_click(event){
            // If editing then pass event to parent, otherwise toggle zoom
            if (this.editing){
                this.$listeners.click(event)
            } else {
                this.zoom = !this.zoom
            }
        },

        bg_click(){
            this.zoom = false
        },

        set_page_scroll(value){
            // Set whether whole page can scroll or not (want to disable when zooming image)
            self.document.body.style.overflowY = value ? 'auto' : 'hidden'
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

    &.editing
        cursor: pointer

    &.zoom
        background-color: black
        color: white
        position: fixed
        top: 0
        bottom: 0
        left: 0
        right: 0
        z-index: 9999
        cursor: zoom-out !important


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

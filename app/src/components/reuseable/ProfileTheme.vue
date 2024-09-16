
<template lang='pug'>

div

    app-select(v-model='theme_style' :items='theme_style_items' select label="Style")

    //- NOTE width must be static as Vuetify doesn't support responsive for the canvas yet
    v-color-picker(v-model='theme_color' mode='hsla' :swatches='swatches'
        :show-swatches='!custom_color' :hide-inputs='!custom_color' :hide-canvas='!custom_color'
        :hide-sliders='!custom_color' width='560' swatches-max-height='auto')

    div(class='text-center mb-4')
        app-btn(v-if='!custom_color' @click='custom_color = true' small) Custom color

    div.stello-displayer(:style='theme_style_props' :class='`style-${theme_style}`'
            class='px-4 pt-4 pb-16')
        div.content
            shared-hero(v-if='hero.data' :image='hero' :theme_style='theme_style' :first='true')
            p(class='my-4 mx-6')
                | Style affects the font of headings and paragraphs, as well as more subtle
                | elements such as the rounding of corners and shape of some sections.
                | The color chosen will be used as the background color, and other elements
                | will also derive their own colors from the background you chose,
                | <a>such as links</a> and buttons.
            p(class='text-center')
                button(class='btn-text s-primary') Button

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import SharedHero from '@/shared/SharedHero.vue'
import {Profile} from '@/services/database/profiles'
import {gen_theme_style_props} from '@/shared/shared_theme'
import {debounce_set} from '@/services/misc'


@Component({
    components: {SharedHero},
})
export default class extends Vue {

    @Prop({type: Profile, required: true}) declare readonly profile:Profile

    hero_image:Blob|null = null
    custom_color = false
    theme_style_items = [
        {value: 'modern', text: "Modern"},
        {value: 'formal', text: "Formal"},
        {value: 'beautiful', text: "Beautiful"},
        {value: 'fun', text: "Fun"},
    ]
    swatches = [
        ['#ef9a9a', '#f44336', '#b71c1c'],
        ['#f48fb1', '#e91e63', '#880e4f'],
        ['#ce93d8', '#9c27b0', '#4a148c'],
        ['#9fa8da', '#3f51b5', '#1a237e'],
        ['#90caf9', '#2196f3', '#0d47a1'],
        ['#80cbc4', '#009688', '#004d40'],
        ['#a5d6a7', '#4caf50', '#1b5e20'],
        ['#fff59d', '#ffeb3b', '#a19500'],  // Custom value for dark yellow since usual orangish
        ['#ffcc80', '#ff9800', '#e65100'],
        ['#bcaaa4', '#795548', '#3e2723'],
    ]

    async created(){
        // Load example image for use in hero
        this.hero_image = new Blob(
            [await self.app_native.app_file_read('default_invite_image.jpg')],
            {type: 'image/jpeg'},
        )
    }

    get theme_style_props(){
        // CSS style props for theme (forcing non-dark since dark bg sometimes not same as chosen)
        return gen_theme_style_props(false, this.theme_style, this.theme_color)
    }

    get hero(){
        // Example data for hero component
        return {
            data: this.hero_image,
            caption: "How it will look",
        }
    }

    get theme_style(){
        return this.profile.options.theme_style
    }
    set theme_style(value){
        this.profile.options.theme_style = value
        this.$emit('save', true)  // true to mark needing config update
    }

    get theme_color(){
        return this.profile.options.theme_color
    }
    @debounce_set(100) set theme_color(value){
        this.profile.options.theme_color = {h: value.h, s: value.s, l: value.l}
        this.$emit('save', true)  // true to mark needing config update
    }
}

</script>


<style lang='sass' scoped>

.stello-displayer
    font-size: 16px

    .content
        margin: 0

</style>

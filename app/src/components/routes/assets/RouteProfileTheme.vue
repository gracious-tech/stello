
<template lang='pug'>

div

    app-select(v-model='theme_style' :items='theme_style_items' select label="Style")

    //- NOTE width must be static as Vuetify doesn't support responsive for the canvas yet
    v-color-picker(v-model='theme_color' mode='hsla' :swatches='swatches'
        :show-swatches='!custom_color' :hide-inputs='!custom_color' :hide-canvas='!custom_color'
        :hide-sliders='!custom_color' width='560')

    div(class='text-center mb-4')
        app-btn(v-if='!custom_color' @click='custom_color = true' small) Custom color

    div.stello-displayer(:style='theme_style_props' :class='`style-${theme_style}`'
            class='px-4 pt-4 pb-16')
        div.content
            h1 Your message will look like this
            p
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

import {Profile} from '@/services/database/profiles'
import {gen_theme_style_props} from '@/shared/shared_theme'
import {debounce_set} from '@/services/misc'


@Component({})
export default class extends Vue {

    @Prop({type: Profile, required: true}) declare readonly profile:Profile

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

    get theme_style_props(){
        // CSS style props for theme (forcing non-dark since dark bg sometimes not same as chosen)
        return gen_theme_style_props(false, this.theme_style, this.theme_color)
    }

    get theme_style(){
        return this.profile.options.theme_style
    }
    set theme_style(value){
        this.profile.options.theme_style = value
        this.save()
    }

    get theme_color(){
        return this.profile.options.theme_color
    }
    @debounce_set(100) set theme_color(value){
        this.profile.options.theme_color = {h: value.h, s: value.s, l: value.l}
        this.save()
    }

    save(){
        // Save changes to profile
        this.profile.host_state.displayer_config_uploaded = false
        void self.app_db.profiles.set(this.profile)
    }

}

</script>


<style lang='sass' scoped>

.stello-displayer
    font-size: 16px

    .content
        padding: 12px 24px

</style>

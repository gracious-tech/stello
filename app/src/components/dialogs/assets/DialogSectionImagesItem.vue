
<template lang='pug'>

div(class='my-5')
    div(class='d-flex align-center mb-3')
        div(class='flex d-flex justify-center')
            shared-hero.hero(v-if='section.is_hero' :image='item' :theme_style='theme_style'
                :first='false' :class='`style-${theme_style}`' :style='theme_style_props')
            div.displayer(v-else :style='displayer_styles' :class='{multiple}')
                img.sizer(:src='sizer_src')
        div(class='d-flex flex-column')
            app-btn(@click='move_up' :disabled='is_first' icon='arrow_upward')
            app-btn(@click='move_down' :disabled='is_last' icon='arrow_downward')
            app-btn(@click='remove' color='error' icon='delete')
    div
        app-textarea(v-model='caption' :placeholder='section.is_hero ? "Banner text" : "Caption"'
            :rows='1' regular dense @keydown.enter.prevent)

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import SharedHero from '@/shared/SharedHero.vue'
import {Section} from '@/services/database/sections'
import {ContentImages} from '@/services/database/types'
import {Profile} from '@/services/database/profiles'
import {gen_theme_style_props} from '@/shared/shared_theme'


@Component({
    components: {SharedHero},
})
export default class extends Vue {

    @Prop() declare readonly section:Section<ContentImages>
    @Prop() declare readonly item_index:number
    @Prop({type: Profile, default: null}) declare readonly profile:Profile|null

    get item(){
        // Return individual image object represented by this component
        return this.section.content.images[this.item_index]
    }

    get sizer_src(){
        // Return blob url for first image (may not be this one) so can use for sizing purposes
        return URL.createObjectURL(this.section.content.images[0].data)
    }

    get displayer_styles(){
        // Return background image styles for displaying the image this component represents
        const url = URL.createObjectURL(this.item.data)
        return {
            backgroundImage: `url(${url})`,
            backgroundSize: this.section.content.crop ? 'cover' : 'contain',
        }
    }

    get caption(){
        // Return caption for this image
        return this.item.caption
    }
    set caption(value){
        // Change the caption of this image
        this.item.caption = value
        self.app_db.sections.set(this.section)
    }

    get is_first(){
        // Boolean for whether this image is first of set
        return this.item_index === 0
    }

    get is_last(){
        // Boolean for whether this image is last of set
        return this.item_index === this.section.content.images.length - 1
    }

    get multiple(){
        // Whether multiple images exist in section
        return this.section.content.images.length > 1
    }

    get theme_style(){
        // Access to theme style profile option (if available)
        return this.profile?.options.theme_style ?? 'modern'
    }

    get theme_style_props(){
        // Provide access to theme vars so hero can use them
        // NOTE dark prop doesn't affect anything in hero since only the hue is used
        const color = this.profile?.options.theme_color
            ?? self.app_db.profiles.get_default_theme_color()
        return gen_theme_style_props(false, this.theme_style, color)
    }

    move_up(){
        // Move this image up in the set
        const prev_item = this.section.content.images[this.item_index - 1]
        this.section.content.images.splice(this.item_index - 1, 2, this.item, prev_item)
        self.app_db.sections.set(this.section)
    }

    move_down(){
        // Move this image down in the set
        const next_item = this.section.content.images[this.item_index + 1]
        this.section.content.images.splice(this.item_index, 2, next_item, this.item)
        self.app_db.sections.set(this.section)
    }

    remove(){
        // Remove this image (and cause this component to be destroyed)
        this.section.content.images.splice(this.item_index, 1)
        self.app_db.sections.set(this.section)
    }

}

</script>


<style lang='sass' scoped>

@import 'src/shared/shared_mixins'

.hero
    // Provide hero with same styles it would have within a .stello-displayer class
    @include stello_vars
    ::v-deep h1
        font-family: var(--stello-font-headings)

.displayer
    display: inline-block
    background-position: center

    &.multiple
        // Only solo images allow transparency, bg helps to show cropping/sizing when multiple
        background-color: black

.sizer
    margin: 0 auto
    position: relative
    left: -99999px

.sizer, .hero
    width: 100%
    max-height: 300px

</style>


<template lang='pug'>

div.dialog-section-images-item(class='my-5')

    div(v-html='aspect_style')

    div(class='d-flex align-center mb-3')

        div(class='flex d-flex justify-center')
            image-edit-bar.bar(:blob='item.data' @changed='image_edited')
                shared-hero.hero(v-if='section.is_hero' ref='hero' :image='item'
                    :theme_style='theme_style' :first='false' :class='`style-${theme_style}`'
                    :style='theme_style_props' class='stello-displayer-styles')
                img.img(v-else ref='img' :src='img_src' :class='{multiple, crop}')

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
import ImageEditBar from '@/components/reuseable/ImageEditBar.vue'
import {Section} from '@/services/database/sections'
import {ContentImages} from '@/services/database/types'


@Component({
    components: {SharedHero, ImageEditBar},
})
export default class extends Vue {

    @Prop({type: Object, required: true}) declare readonly section:Section<ContentImages>
    @Prop({type: Number, required: true}) declare readonly item_index:number
    @Prop({type: Object, required: true}) declare readonly theme_style_props:Record<string, string>
    @Prop({type: String, required: true}) declare readonly aspect:string

    get item(){
        // Return individual image object represented by this component
        return this.section.content.images[this.item_index]!
    }

    get img_src(){
        return URL.createObjectURL(this.item.data)
    }

    get caption(){
        // Return caption for this image
        return this.item.caption
    }
    set caption(value){
        // Change the caption of this image
        this.item.caption = value
        void self.app_db.sections.set(this.section)
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

    get crop(){
        // Whether crop is enabled
        return this.section.content.crop
    }

    get theme_style(){
        // Access to theme style
        return this.theme_style_props['--stello-style']
    }

    get aspect_style(){
        // Hack for ensuring aspect-ratio always applied to elements that often get added/removed
        // e.g. they get removed when Croppr enabled
        // NOTE Croppr not included as should expand when region editing so can see whole image
        return `<style>
            .dialog-section-images-item .img, .dialog-section-images-item .hero {
                aspect-ratio: ${this.aspect};
            }
        </style>`
    }

    image_edited(blob:Blob){
        // If image edited, replace and save record
        this.item.data = blob
        this.save()
    }

    move_up(){
        // Move this image up in the set
        const prev_item = this.section.content.images[this.item_index - 1]!
        this.section.content.images.splice(this.item_index - 1, 2, this.item, prev_item)
        this.save()
    }

    move_down(){
        // Move this image down in the set
        const next_item = this.section.content.images[this.item_index + 1]!
        this.section.content.images.splice(this.item_index, 2, next_item, this.item)
        this.save()
    }

    remove(){
        // Remove this image (and cause this component to be destroyed)
        this.section.content.images.splice(this.item_index, 1)
        this.save()
    }

    save(){
        // Save changes to section
        void self.app_db.sections.set(this.section)
    }

}

</script>


<style lang='sass' scoped>


.img
    object-fit: contain

    &.crop
        object-fit: cover

    &.multiple
        // Only solo images allow transparency, bg helps to show cropping/sizing when multiple
        background-color: black

.bar
    // WARN Might be nice to have max-height for images, but messes up aspect-ratio obedience
    //      If desired should revert to old method of including hidden first image as sizer
    width: 100%
    ::v-deep
        // Apply to whatever element is showing the image (including croppr)
        // NOTE Apply to croppr images rather than container as container won't grow if img doesn't
        .img, .hero, .croppr-container img
            width: 100%

</style>

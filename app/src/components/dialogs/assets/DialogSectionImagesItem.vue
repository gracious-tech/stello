
<template lang='pug'>

div(class='my-5')
    div(class='d-flex align-center mb-3')
        div(class='flex text-center')
            div.displayer(:style='displayer_styles')
                img.sizer(:src='sizer_src')
        div(class='d-flex flex-column')
            app-btn(@click='move_up' :disabled='is_first' icon='arrow_upward')
            app-btn(@click='move_down' :disabled='is_last' icon='arrow_downward')
            app-btn(@click='remove' color='error' icon='delete')
    div
        app-textarea(v-model='caption' placeholder="Caption" :rows='1' regular dense)

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {debounce_set} from '@/services/misc'
import {Section} from '@/services/database/sections'
import {ContentImages} from '@/services/database/types'


@Component({})
export default class extends Vue {

    @Prop() section:Section<ContentImages>
    @Prop() item_index:number

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
            'background-image': `url(${url})`,
            'background-size': this.section.content.crop ? 'cover' : 'contain',
        }
    }

    get caption(){
        // Return caption for this image
        return this.item.caption
    }
    @debounce_set() set caption(value){
        // Change the caption of this image
        this.item.caption = value
        self._db.sections.set(this.section)
    }

    get is_first(){
        // Boolean for whether this image is first of set
        return this.item_index === 0
    }

    get is_last(){
        // Boolean for whether this image is last of set
        return this.item_index === this.section.content.images.length - 1
    }

    move_up(){
        // Move this image up in the set
        const prev_item = this.section.content.images[this.item_index - 1]
        this.section.content.images.splice(this.item_index - 1, 2, this.item, prev_item)
        self._db.sections.set(this.section)
    }

    move_down(){
        // Move this image down in the set
        const next_item = this.section.content.images[this.item_index + 1]
        this.section.content.images.splice(this.item_index, 2, next_item, this.item)
        self._db.sections.set(this.section)
    }

    remove(){
        // Remove this image (and cause this component to be destroyed)
        this.section.content.images.splice(this.item_index, 1)
        self._db.sections.set(this.section)
    }

}

</script>


<style lang='sass' scoped>


.displayer
    display: inline-block
    background-position: center

.sizer
    width: 100%
    max-width: 300px
    margin: 0 auto
    position: relative
    left: -99999px

</style>

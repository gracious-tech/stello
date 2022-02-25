
<template lang='pug'>

div.addbar(:class='{visible}')
    span.prompt(v-if='visible' class='noselect') Add a section
    app-btn.plus(icon='add')
    div.buttons
        app-btn(@click='add_text' icon='subject' data-tip="Add text")
        app-btn(@click='add_images' icon='image' data-tip="Add images")
        app-btn(@click='add_video' icon='video' data-tip="Add video")
        app-btn(@click='add_page' icon='library_books' data-tip="Add page")
        //- app-btn(icon='pie_chart')
        //- app-btn(icon='attach_file')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({type: Boolean, default: false}) declare readonly visible:boolean  // Not just on hover

    add_text(){
        this.$emit('add', 'text')
    }

    add_images(){
        this.$emit('add', 'images')
    }

    add_video(){
        this.$emit('add', 'video')
    }

    add_page(){
        this.$emit('add', 'page')
    }
}

</script>


<style lang='sass' scoped>

.addbar

    .prompt
        opacity: 0.6

    .plus
        opacity: 0.15

    .buttons
        display: none

    &.visible, &:hover
        .plus
            display: none
        .buttons
            display: block

</style>

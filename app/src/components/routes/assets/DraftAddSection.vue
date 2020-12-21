
<template lang='pug'>

div
    //- Parent div needed so can position as block but not trigger hover over whole block width
    div.toolbar(:class='{keep_visible}')
        app-btn.add(icon='add')
        app-btn(@click='add_text' icon='subject')
        app-btn(@click='add_images' icon='image')
        //- app-btn(icon='video')
        //- app-btn(icon='pie_chart')
        //- app-btn(icon='attach_file')
        //- app-btn(icon='library_books')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop() draft
    @Prop() position
    @Prop({type: Boolean, default: false}) visible  // Sets default for keep_visible
    keep_visible = false

    created(){
        this.keep_visible = this.visible
    }

    toggle_visibility(){
        // TODO Trigger on tap (touch click) for add button (but not for mouse click)
        // NOTE Hover relied on for desktops, but toggle needed for touch screens
        this.keep_visible = !this.keep_visible
    }

    add(type){
        self._db.draft_section_create(this.draft, type, this.position)
        this.keep_visible = false
    }

    add_text(){
        this.add('text')
    }

    add_images(){
        this.add('images')
    }

}

</script>


<style lang='sass' scoped>


.toolbar
    display: inline-block

    // Don't show section type buttons unless hovering or keeping visible
    &:not(:hover):not(.keep_visible) .v-btn:not(.add)
        visibility: hidden

    // Make add button barely visible unless keeping visible
    &:not(.keep_visible) .add
        opacity: 0.15


</style>

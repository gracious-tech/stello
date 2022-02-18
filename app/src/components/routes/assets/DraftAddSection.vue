
<template lang='pug'>

div.addbar(:class='{visible}')
    span.prompt(v-if='visible' class='noselect') Add a section
    app-btn.plus(icon='add')
    div.buttons
        app-btn(@click='add_text' icon='subject' data-tip="Add text")
        app-btn(@click='add_images' icon='image' data-tip="Add images")
        app-btn(@click='add_video' icon='video' data-tip="Add a video")
        //- app-btn(icon='pie_chart')
        //- app-btn(icon='attach_file')
        //- app-btn(icon='library_books')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Draft} from '@/services/database/drafts'


@Component({})
export default class extends Vue {

    @Prop() declare readonly draft:Draft
    @Prop() declare readonly position:number
    @Prop({type: Boolean, default: false}) declare readonly visible:boolean  // Not just on hover

    add(type:string){
        self.app_db.draft_section_create(this.draft, type, this.position)
    }

    add_text(){
        this.add('text')
    }

    add_images(){
        this.add('images')
    }

    add_video(){
        this.add('video')
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

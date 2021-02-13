
<template lang='pug'>

div.addbar(:class='{visible}')
    span.prompt(v-if='visible') Add a section
    app-btn.plus(icon='add')
    div.buttons
        app-btn(@click='add_text' icon='subject')
        app-btn(@click='add_images' icon='image')
        //- app-btn(icon='video')
        //- app-btn(icon='pie_chart')
        //- app-btn(icon='attach_file')
        //- app-btn(icon='library_books')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Draft} from '@/services/database/drafts'


@Component({})
export default class extends Vue {

    @Prop() draft:Draft
    @Prop() position:number
    @Prop({type: Boolean, default: false}) visible:boolean  // Show buttons even without hover

    add(type:string){
        self._db.draft_section_create(this.draft, type, this.position)
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

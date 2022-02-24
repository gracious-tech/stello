
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

import {Draft} from '@/services/database/drafts'
import {RecordSectionContent} from '@/services/database/types'


@Component({})
export default class extends Vue {

    @Prop() declare readonly draft:Draft
    @Prop() declare readonly position:number
    @Prop({type: Boolean, default: false}) declare readonly visible:boolean  // Not just on hover

    async add(type:RecordSectionContent['type']){
        // Create the section and then add it (in correct position) to draft in a new row
        const section = await self.app_db.sections.create(type)
        this.draft.sections.splice(this.position, 0, [section.id])
        await self.app_db.drafts.set(this.draft)
    }

    add_text(){
        return this.add('text')
    }

    add_images(){
        return this.add('images')
    }

    add_video(){
        return this.add('video')
    }

    add_page(){
        return this.add('page')
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

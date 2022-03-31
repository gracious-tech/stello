
<template lang='pug'>

div.addbar(:class='{visible}')
    p.prompt(v-if='visible' class='noselect') Add a section
    app-btn.plus(icon='add')
    div.buttons
        app-btn(@click='add("text")' icon='subject' data-tip="Add text")
        app-btn(@click='add("images")' icon='image' data-tip="Add images")
        app-btn(@click='add("video")' icon='video' data-tip="Add video")
        app-btn(@click='add("page")' icon='library_books' data-tip="Add page")
        //- app-btn(icon='pie_chart')
        //- app-btn(icon='attach_file')
        app-btn(v-if='can_paste' @click='add("paste")' icon='content_paste' color='primary'
            data-tip="Paste section")

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({type: Boolean, default: false}) declare readonly visible:boolean  // Not just on hover

    get can_paste(){
        return this.$store.state.tmp.cut_section !== null
    }

    add(type:string){
        this.$emit('add', type)
    }

}

</script>


<style lang='sass' scoped>

@import 'src/styles/utils.sass'


.addbar
    margin-left: $stello_gutter  // Mustn't overlap with move buttons

    .prompt
        opacity: 0.6
        padding-top: 36px

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

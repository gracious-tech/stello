
<template lang='pug'>

div.addbar(:class='{visible}')
    p.prompt(v-if='visible' class='noselect') Add a section
    app-btn.plus(icon='add')
    div.buttons
        app-btn(@click='add("text")' icon='subject' data-tip="Add text")
        app-btn(@click='add("images")' icon='image' data-tip="Add images")
        app-btn(@click='add("video")' icon='video' data-tip="Add video")
        app-btn(@click='add("chart")' icon='insert_chart' data-tip="Add chart")
        app-btn(@click='add("files")' icon='attach_file' data-tip="Add files")
        div.sep &nbsp;
        app-btn(@click='add("page")' icon='library_books' data-tip="Add page")
        template(v-if='can_paste')
            div.sep &nbsp;
            app-btn(@click='add("paste")' icon='content_paste' color='primary'
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

        .sep
            border-left: 1px solid hsla(0, 0%, 50%, 0.5)
            display: inline-block
            width: 1px

    &.visible, &:hover
        .plus
            display: none
        .buttons
            display: block

</style>

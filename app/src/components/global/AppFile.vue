<!-- A file input button -->

<template lang='pug'>

label(class='v-btn v-btn--flat v-btn--text v-size--default accent--text' :class='label_classes')
    slot
    input(@change='changed' type='file' :accept='accept' :multiple='multiple')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop(String) accept:string
    @Prop(Boolean) multiple:boolean

    get label_classes(){
        // Return appropriate classes for label to make it look like a button
        const classes = [this.$vuetify.theme.dark ? 'theme--dark' : 'theme--light']
        if (this.$attrs.color){
            classes.push(`${this.$attrs.color}--text`)
        }
        return classes
    }

    changed(event){
        // Pass on the file/files
        if (!event.target.files[0]){
            return  // Don't emit if no files provided (happens when cancel file dialog)
        }
        this.$emit('input', this.multiple ? Array.from(event.target.files) : event.target.files[0])
    }
}

</script>


<style lang='sass' scoped>

label
    cursor: pointer  // Not actually a button so needs this

    input
        // Hide actual input field so label functions as a button by itself
        position: absolute
        left: -99999px

</style>

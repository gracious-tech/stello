<!-- A file input button -->

<template lang='pug'>

label(class='v-btn v-btn--flat v-btn--text v-size--default' :class='label_classes')
    slot
    input(@change='changed' type='file' :accept='accept' :multiple='multiple' :disabled='disabled')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({type: String, default: ''}) declare readonly accept:string
    @Prop({type: Boolean, default: false}) declare readonly multiple:boolean
    @Prop({type: Boolean, default: false}) declare readonly disabled:boolean

    get label_classes():string[]{
        // Return appropriate classes for label to make it look like a button
        const classes = [this.$vuetify.theme.dark ? 'theme--dark' : 'theme--light']
        if (this.disabled){
            classes.push('v-btn--disabled')
        } else if (this.$attrs['color']){
            classes.push(`${this.$attrs['color']}--text`)
        } else {
            classes.push('accent--text')
        }
        return classes
    }

    changed(event:Event):void{
        // Pass on the file/files
        // NOTE Don't emit if no files provided (happens when cancel file dialog)
        const files = (event.target as HTMLInputElement).files ?? []
        if (files.length){
            this.$emit('input', this.multiple ? Array.from(files) : files[0])
        }
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


<template lang='pug'>

v-card
    v-card-title {{ title }}

    v-card-text(class='mt-4')
        app-textarea(v-if='textarea' v-model='value' :label='label')
        app-text(v-else v-model='value' :label='label')

    v-card-actions
        app-btn(@click='$emit("close")') Cancel
        app-btn(@click='$emit("close", value)') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({required: true}) label:string
    @Prop({default: ''}) initial:string
    @Prop({default: ''}) title:string
    @Prop({default: false}) textarea:boolean

    value:string

    created(){
        this.value = this.initial
    }
}

</script>


<style lang='sass' scoped>

</style>


<template lang='pug'>

v-card
    v-card-title {{ title }}

    v-card-text
        app-text(v-model='value' :label='label' class='mt-4')

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

    value:string

    created(){
        this.value = this.initial
    }
}

</script>


<style lang='sass' scoped>

</style>

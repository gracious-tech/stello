
<template lang='pug'>

v-card
    v-card-title {{ title }}

    v-card-text(v-if='text')
        p {{ text }}

    v-card-actions
        app-btn(@click='$emit("close")') {{ cancel }}
        app-btn(@click='$emit("close", true)' :color='confirm_color') {{ confirm }}

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({required: true}) title:string
    @Prop({default: null}) text:string
    @Prop({default: "Confirm"}) confirm:string
    @Prop({default: "Cancel"}) cancel:string
    @Prop({default: false}) confirm_danger:boolean

    get confirm_color():string{
        // The color of the confirm button
        return this.confirm_danger ? 'error' : 'accent'
    }

}

</script>


<style lang='sass' scoped>

</style>


<template lang='pug'>

v-card
    v-card-title {{ title }}

    v-card-text(v-if='text')
        p {{ text }}

    v-card-actions
        app-btn(@click='$emit("close")') {{ cancel }}
        app-btn(v-if='confirm' @click='$emit("close", true)' :color='confirm_color') {{ confirm }}

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({required: true}) declare readonly title:string
    @Prop({default: null}) declare readonly text:string
    @Prop({default: "Cancel"}) declare readonly cancel:string
    @Prop({default: "Confirm"}) declare readonly confirm:string
    @Prop({default: false}) declare readonly confirm_danger:boolean

    get confirm_color():string{
        // The color of the confirm button
        return this.confirm_danger ? 'error' : 'accent'
    }

}

</script>


<style lang='sass' scoped>

</style>


<template lang='pug'>

v-virtual-scroll(:items='items' :item-height='height')
    template(#default='{item}')
        slot(:item='item' :height_styles='height_styles')

</template>


<script lang='ts'>
import {Component, Vue, Prop} from 'vue-property-decorator'

@Component({})
export default class extends Vue {

    @Prop({type: Array, required: true}) declare readonly items:unknown[]
    @Prop({required: true}) declare readonly height:string|number  // Height of items as integer

    get height_styles():Record<string, string>{
        // Get styles that ensure items are of a specific height (important for virtual scroll)
        return {
            height: `${this.height}px`,
            'min-height': `${this.height}px`,
            'max-height': `${this.height}px`,
        }
    }

}

</script>


<style lang='sass' scoped>

</style>


<style lang='sass'>

@import 'src/styles/utils.sass'

// Styles specific to when used as main page contents
.docked .v-virtual-scroll .v-virtual-scroll__container
    position: relative
    max-width: $content-width
    width: 100%
    margin-left: auto
    margin-right: auto
    margin-bottom: 100px  // Show some space after scrolling to bottom

</style>

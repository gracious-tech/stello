
<template lang='pug'>

.outer
    .inner(:class='inner_class')
        slot

</template>


<script lang='ts'>
import {Component, Vue, Prop} from 'vue-property-decorator'

@Component({})
export default class extends Vue {

    @Prop() declare readonly inner_class
}
</script>


<style lang='sass' scoped>

@import 'src/styles/globals.sass'


.outer
    width: 100%
    flex-grow: 1
    overflow-y: auto

    .inner
        max-width: $content-width
        width: 100%
        margin-left: auto
        margin-right: auto
        padding-bottom: 100px  // Show some space after scrolling to bottom



</style>

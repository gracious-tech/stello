<!-- Wrapper for v-select with better defaults -->

<template lang='pug'>

v-select(
    v-model='wrapped_value'
    :color='$attrs.color || "accent"'
    :item-color='$attrs.color || "accent"'
    :chips='$attrs.multiple'
    deletable-chips
    persistent-hint
    filled
    v-bind='$attrs'
)
    //- NOTE Using $scopedSlots and receiving props via `v-slot:[name]='props'` seems to have bug
    template(v-for='(slot_array, slot_name) of $slots' v-slot:[slot_name])
        slot(:name='slot_name')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop() value

    get wrapped_value(){
        return this.value
    }
    set wrapped_value(value){
        this.$emit('input', value)
    }
}

</script>


<style lang='sass' scoped>

::v-deep .v-select__selections
    .select__selection
        // Don't know why this is limited to 90% width
        max-width: initial
    input
        // Hide invisible input node that takes up a little space (don't know what it's for)
        display: none

</style>

<!-- Wrapper for v-textarea with better defaults -->

<template lang='pug'>

v-textarea(
    v-bind='$attrs'
    v-on='$listeners'
    v-model='wrapped_value'
    :color='$attrs["color"] || "accent"'
    :persistent-hint='!hint_on_focus'
    :filled='!regular'
    auto-grow
)

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop(String) declare readonly value:string
    @Prop({type: Boolean, default: false}) declare readonly regular:boolean  // Whether to use regular styling
    @Prop({type: Boolean, default: false}) declare readonly hint_on_focus:boolean

    get wrapped_value(){
        return this.value
    }
    set wrapped_value(value){
        this.$emit('input', value)
    }
}

</script>


<style lang='sass' scoped>

</style>

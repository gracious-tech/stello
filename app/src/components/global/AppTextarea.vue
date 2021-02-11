<!-- Wrapper for v-textarea with better defaults -->

<template lang='pug'>

v-textarea(
    v-model='wrapped_value'
    :color='$attrs.color || "accent"'
    :persistent-hint='!hint_on_focus'
    :filled='!regular'
    auto-grow
    v-bind='$attrs'
)

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop(String) value:string
    @Prop({type: Boolean, default: false}) regular:boolean  // Whether to use regular styling
    @Prop({type: Boolean, default: false}) hint_on_focus:boolean

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

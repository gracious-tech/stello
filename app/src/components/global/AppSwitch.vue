<!-- Wrapper for v-switch with better defaults -->

<template lang='pug'>

v-switch(
    v-model='wrapped_value'
    :color='$attrs.color || "accent"'
    persistent-hint
    v-bind='$attrs'
)

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop(Boolean) value
    @Prop({type: Boolean, default: null}) disabled_value

    get wrapped_value(){
        // NOTE Can optionally set what value should be when disabled, rather than actual value
        if (this.$attrs.disabled && this.disabled_value !== null){
            return this.disabled_value
        }
        return this.value
    }
    set wrapped_value(value){
        this.$emit('input', value)
    }
}

</script>


<style lang='sass' scoped>

</style>

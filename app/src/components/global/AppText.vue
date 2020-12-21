<!-- Wrapper for v-text-field with better defaults -->

<template lang='pug'>

v-text-field(
    v-model.trim='wrapped_value'
    :color='$attrs.color || "accent"'
    :persistent-hint='!hint_on_focus'
    filled
    v-bind='$attrs'
)
    //- WARN Doesn't support scoped slots yet (see https://stackoverflow.com/questions/50891858/)
    slot(v-for='slot in other_slots' :name='slot' :slot='slot')
    template(#append)
        slot(name='append')
        app-security-icon(v-if='security' :msg='security')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop(String) value
    @Prop(String) security
    @Prop({type: Boolean, default: false}) hint_on_focus

    get wrapped_value(){
        return this.value
    }
    set wrapped_value(value){
        this.$emit('input', value)
    }

    get other_slots(){
        // Get slots that aren't already manually defined in template
        return Object.keys(this.$slots).filter(s => s !== 'append')
    }
}

</script>


<style lang='sass' scoped>

</style>

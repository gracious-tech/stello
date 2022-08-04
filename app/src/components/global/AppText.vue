<!-- Wrapper for v-text-field with better defaults -->

<template lang='pug'>

v-text-field(
    v-bind='$attrs'
    v-on='$listeners'
    v-model='wrapped_value'
    :color='$attrs["color"] || "accent"'
    :persistent-hint='!hint_on_focus'
    :spellcheck='spellcheck'
    filled
)
    template(#append)
        slot(name='append')
        app-security-icon(v-if='security' :msg='security')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop(String) declare readonly value:string
    @Prop(String) declare readonly security:string
    @Prop({type: Boolean, default: false}) declare readonly hint_on_focus:boolean
    // Default to not spellchecking as fields usually user-specific data
    // NOTE value should be inserted in DOM as "true"|"false" string, which converting boolean does
    @Prop({type: Boolean, default: false}) declare readonly spellcheck:boolean

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

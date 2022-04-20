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
    //- WARN Doesn't support scoped slots yet (see https://stackoverflow.com/questions/50891858/)
    slot(v-for='slot in other_slots' :key='slot' :name='slot' :slot='slot')
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

    get other_slots(){
        // Get slots that aren't already manually defined in template
        return Object.keys(this.$slots).filter(s => s !== 'append')
    }
}

</script>


<style lang='sass' scoped>

</style>

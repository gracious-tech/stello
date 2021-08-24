<!-- Wrapper for v-select with better defaults -->

<template lang='pug'>

component(
    v-bind='$attrs'
    :is='component'
    v-model='wrapped_value'
    :color='$attrs["color"] || "accent"'
    :item-color='$attrs["color"] || "accent"'
    :chips='$attrs["multiple"]'
    :spellcheck='false'
    deletable-chips
    persistent-hint
    filled
)
    //- NOTE Using $scopedSlots and receiving props via `v-slot:[name]='props'` seems to have bug
    template(v-for='slot_name of Object.keys($slots)' v-slot:[slot_name])
        slot(:name='slot_name')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'
import {VSelect} from 'vuetify/lib/components/VSelect'
import {VAutocomplete} from 'vuetify/lib/components/VAutocomplete'


@Component({})
export default class extends Vue {

    @Prop() value
    @Prop({type: Boolean, default: false}) select:boolean  // Whether select only (no autocomplete)

    get wrapped_value(){
        return this.value
    }
    set wrapped_value(value){
        this.$emit('input', value)
    }

    get component(){
        // Return either an autocomplete or a select component depending on viewport height
        // Autocomplete useful to filter lists, but opens keyboard on mobiles resulting in bad UX
        if (this.select){
            return VSelect
        }
        const keyboard_height = 260
        const autocomplete_desired_height = 550
        const required_height = keyboard_height + autocomplete_desired_height
        return self.innerHeight > required_height ? VAutocomplete : VSelect
    }
}

</script>


<style lang='sass' scoped>

::v-deep .v-select__selections
    .select__selection
        // Don't know why this is limited to 90% width
        max-width: initial

</style>

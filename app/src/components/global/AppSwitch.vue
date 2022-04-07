<!-- Wrapper for v-switch with better defaults -->

<template lang='pug'>

div(:class='{both: !!label_false}')
    div(class='d-flex align-center mt-5')
        span(v-if='label_false' @click='toggle' class='v-label mr-2'
            :class='$store.state.dark ? "theme--dark" : "theme--light"') {{ label_false }}
        v-switch(v-bind='$attrs' v-model='wrapped_value' :color='$attrs["color"] || "accent"'
            persistent-hint)
        span(@click='toggle' class='v-label ml-2'
            :class='$store.state.dark ? "theme--dark" : "theme--light"') {{ label }}
    //- Show own hint so can span whole length across custom labels
    div.hint(class='v-messages mb-5') {{ hint }}

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({type: Boolean, required: true}) declare readonly value:boolean
    @Prop({type: String, default: null}) declare readonly label:string|null
    @Prop({type: String, default: null}) declare readonly label_false:string|null
    @Prop({type: Boolean, default: null}) declare readonly disabled_value:boolean|null
    @Prop({type: String, default: null}) declare readonly hint:string|null

    get wrapped_value(){
        // NOTE Can optionally set what value should be when disabled, rather than actual value
        if (this.$attrs['disabled'] && this.disabled_value !== null){
            return this.disabled_value
        }
        return this.value
    }
    set wrapped_value(value){
        this.$emit('input', value)
    }

    toggle(){
        this.$emit('input', !this.value)
    }
}

</script>


<style lang='sass' scoped>

.v-label
    // Clicking labels toggles switch
    user-select: none
    cursor: pointer

.both ::v-deep .v-input.v-input--switch .v-input--selection-controls__input div:not([aria-disabled])
    // Make switch look active whether true or false
    // NOTE Overly specific to override existing style
    color: var(--accent) !important

    // Make track of switch neutral to more easily see which side is enabled
    &.v-input--switch__track
        color: hsla(0, 0%, 50%, 0.8) !important

::v-deep
    // Remove default padding so can self-align
    .v-input, .v-input__slot, .v-input--selection-controls
        margin: 0
        padding: 0
    .v-messages:not(.hint)
        display: none  // Don't show switch's inbuilt hint

</style>

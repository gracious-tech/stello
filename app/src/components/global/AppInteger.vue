<!-- A positive integer component -->

<template lang='pug'>

v-text-field(
    v-model.trim='text_value'
    :placeholder='`${default_value}`'
    :error-messages='error'
    :color='$attrs.color || "accent"'
    inputmode='numeric'
    persistent-hint
    filled
    v-bind='$attrs'
)
    template(#append v-if='buttons')
        app-btn(@click='decrease' :disabled='$attrs.disabled || is_min' icon='remove')
        app-btn(@click='increase' :disabled='$attrs.disabled || is_max' icon='add')
        v-btn.min(@click='set_min' :disabled='$attrs.disabled || is_min' icon) min
        v-btn.max(@click='set_max' :disabled='$attrs.disabled || is_max' icon) max

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop(Number) value
    @Prop(Number) inherit  // The placeholder shown if value null (but also affects increments)
    @Prop({type: Number, default: 0, validator: v => v >= 0}) min
    @Prop({type: Number, default: 1000000}) max  // Either max possible, or max before infinity
    @Prop({type: Boolean, default: false}) infinity  // Allowed to be infinity after max reached
    @Prop({type: Boolean, default: true}) buttons

    error = null

    get text_value(){
        // The value given to the text field component
        return this.value === Infinity ? '∞' : `${this.value ?? ''}`
    }
    set text_value(value){
        // Only emit (to update actual value) if input is valid

        // Get cleaned input (or error string)
        const result = this.handle_input(value)

        // Any string result is an error
        if (typeof result === 'string'){
            this.error = result
        } else {
            this.emit(result)
        }
    }

    get default_value(){
        // Either the value to inherit if none set, or min
        return this.inherit ?? this.min
    }

    get virtual_value(){
        // Either the num value, or the default if that is null
        return this.value ?? this.default_value
    }

    get real_max(){
        // Account for Infinity being the true max (if enabled)
        return this.infinity ? Infinity : this.max
    }

    get is_min(){
        return this.virtual_value <= this.min
    }

    get is_max(){
        return this.virtual_value >= this.real_max
    }

    emit(value){
        // Emit a valid value and ensure error isn't set
        this.error = null
        this.$emit('input', value)
    }

    handle_input(value){
        // Return a string for an error, otherwise null or number to emit
        if (value === '')
            return null
        const num = parseFloat(value)
        if (Number.isNaN(num))
            return "Must be a number"
        if (!Number.isInteger(num))
            return "Must be an integer"
        if (num < this.min)
            return `Cannot be less than ${this.min}`
        if (num > this.real_max)
            return `Cannot be more than ${this.max}`
        // If value greater than max and infinity allowed, return Infinity so user knows
        // WARN Important for lifespan as if e.g. 500 is allowed, msg will never expire since no tag
        if (num > this.max && this.infinity)
            return Infinity
        return num
    }

    decrease(){
        // Decrease the current value by 1 (assumed not already at min)
        this.emit(this.virtual_value === Infinity ? this.max : this.virtual_value - 1)
    }

    increase(){
        // Increase the current value by 1 (assumed not already at real_max)
        this.emit(this.virtual_value >= this.max ? Infinity : this.virtual_value + 1)
    }

    set_min(){
        this.emit(this.min)
    }

    set_max(){
        this.emit(this.real_max)
    }

}

</script>


<style lang='sass' scoped>

.v-input
    max-width: 320px  // Wide enough to still display hint etc properly, but not full length

    ::v-deep
        label
            max-width: none
        .min, .max
            font-size: 12px
        input
            text-align: center

</style>

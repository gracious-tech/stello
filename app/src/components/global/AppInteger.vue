<!-- A positive integer component -->

<template lang='pug'>

v-text-field(
    v-bind='$attrs'
    v-model.trim='text_value'
    :placeholder='`${default_value}`'
    :error-messages='error'
    :color='$attrs["color"] || "accent"'
    inputmode='numeric'
    persistent-hint
    persistent-placeholder
    filled
)
    template(#append v-if='buttons')
        app-btn(@click='decrease' :disabled='$attrs["disabled"] || is_min' icon='remove')
        app-btn(@click='increase' :disabled='$attrs["disabled"] || is_max' icon='add')
        v-btn.min(@click='set_min' :disabled='$attrs["disabled"] || is_min' icon) min
        v-btn.max(@click='set_max' :disabled='$attrs["disabled"] || is_max' icon) max

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({type: Number}) value:number
    @Prop({type: Number, default: null}) inherit:number  // For placeholder, also affects increments
    @Prop({type: Number, default: 0, validator: v => v >= 0}) min:number
    @Prop({type: Number, default: 1000000}) max:number  // Either max possible, or max before inf.
    @Prop({type: Boolean, default: false}) infinity:boolean  // Can be infinity after max reached
    @Prop({type: Boolean, default: true}) buttons:boolean

    error = null

    get text_value():string{
        // The value given to the text field component
        return this.value === Infinity ? '∞' : `${this.value ?? ''}`
    }
    set text_value(value:string){
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

    get default_value():number{
        // Either the value to inherit if none set, or min
        return this.inherit ?? this.min
    }

    get virtual_value():number{
        // Either the num value, or the default if that is null
        return this.value ?? this.default_value
    }

    get real_max():number{
        // Account for Infinity being the true max (if enabled)
        return this.infinity ? Infinity : this.max
    }

    get is_min():boolean{
        return this.virtual_value <= this.min
    }

    get is_max():boolean{
        return this.virtual_value >= this.real_max
    }

    emit(value:number):void{
        // Emit a valid value and ensure error isn't set
        this.error = null
        this.$emit('input', value)
    }

    handle_input(value:string):string|number{
        // Return a string for an error, otherwise null or number to emit
        if (value === '')
            // If able to inherit then null marks inheritance, but otherwise can't be null
            return this.inherit === null ? this.default_value : null
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

    decrease():void{
        // Decrease the current value by 1 (assumed not already at min)
        this.emit(this.virtual_value === Infinity ? this.max : this.virtual_value - 1)
    }

    increase():void{
        // Increase the current value by 1 (assumed not already at real_max)
        this.emit(this.virtual_value >= this.max ? Infinity : this.virtual_value + 1)
    }

    set_min():void{
        this.emit(this.min)
    }

    set_max():void{
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

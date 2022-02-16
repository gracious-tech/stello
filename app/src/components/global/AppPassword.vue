
<template lang='pug'>

app-text(
    v-model='wrapped_value'
    :type='visible ? "text" : "password"'
    v-bind='$attrs'
)
    template(#append)
        app-btn(@click='visible = !visible' :icon='visible ? "visibility" : "visibility_off"'
            data-tip="Reveal/hide")

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop() declare readonly value
    visible = false

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

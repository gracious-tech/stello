
<template lang='pug'>

app-text(
    v-model='wrapped_value'
    :type='visible ? "text" : "password"'
    v-bind='$attrs'
)
    template(#append)
        v-btn(@click='visible = !visible' icon)
            app-svg(:name='visible ? "icon_visibility" : "icon_visibility_off"')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop() value
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

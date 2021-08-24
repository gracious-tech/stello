<!-- A checkbox that acts as a button rather than handling state internally -->

<template lang='pug'>

app-btn(v-bind='$attrs' v-on='$listeners' :icon='icon' :color='color')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({type: Boolean}) value:boolean

    get icon(){
        return `checkbox_${this.value}`  // Expecting true|false|null
    }

    get color():string{
        // Give color when value true/null but not false
        const color = this.$attrs['color'] ?? 'accent'
        return this.value === false ? '' : color
    }

}

</script>


<style lang='sass' scoped>


</style>

<!-- A checkbox that acts as a button rather than handling state internally -->

<template lang='pug'>

app-btn(:icon='icon' :color='value === false ? "" : "accent"' v-on='$listeners' v-bind='$attrs')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({type: Boolean}) value

    get icon(){
        return `checkbox_${this.value}`  // Expecting true|false|null
    }

}

</script>


<style lang='sass' scoped>


</style>

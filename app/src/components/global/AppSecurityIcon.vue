
<template lang='pug'>

v-tooltip(top open-on-click)

    template(#activator='tooltip')
        app-btn(v-bind='tooltip.attrs' v-on='tooltip.on' icon='privacy_tip' color='#ffc400')

    span {{ msg }}

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop() msg

}

</script>


<style lang='sass' scoped>


</style>

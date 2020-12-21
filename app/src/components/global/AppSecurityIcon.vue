
<template lang='pug'>

v-tooltip(top open-on-click)

    template(#activator='tooltip')
        v-btn(v-bind='tooltip.attrs' v-on='tooltip.on' icon color='#ffc400')
            app-svg(name='icon_privacy_tip')

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

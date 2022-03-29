<!-- The base for a vertical dots 'more' menu -->

<template lang='pug'>

v-menu
    template(#activator='menu')
        //- .menu-more-btn added so can identify button when using this component
        app-btn.menu-more-btn(v-bind='$attrs' @click.prevent='menu.on.click' :icon='icon')
    v-list
        slot

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({type: String, default: 'more_vert'}) declare readonly icon:string

}

</script>


<style lang='sass' scoped>

</style>

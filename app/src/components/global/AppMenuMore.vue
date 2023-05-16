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

import {Component, Vue, Prop, Provide} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({type: String, default: 'more_vert'}) declare readonly icon:string

    // Hack to stop Vuetify deselecting list item if this menu is a child of a list item
    // e.g. In groups list of RouteContacts
    // See https://github.com/vuetifyjs/vuetify/issues/9406#issuecomment-756806548
    @Provide() isInGroup = false
    @Provide() listItemGroup = undefined
}

</script>


<style lang='sass' scoped>

</style>

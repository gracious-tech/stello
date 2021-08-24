<!-- The base for a vertical dots 'more' menu -->

<template lang='pug'>

v-menu
    template(#activator='menu')
        //- .menu-more-btn added so can identify button when using this component
        app-btn.menu-more-btn(@click.prevent='menu.on.click' icon='more_vert')
    v-list
        slot

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

}

</script>


<style lang='sass' scoped>

</style>

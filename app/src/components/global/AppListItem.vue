<!-- Wrapper for v-list-item -->

<template lang='pug'>

v-list-item(v-bind='$attrs' v-on='$listeners'
        :target='$attrs["target"] || ($attrs["href"] && "_blank")')
    v-list-item-content
        v-list-item-title
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

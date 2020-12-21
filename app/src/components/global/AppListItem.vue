<!-- Wrapper for v-list-item -->

<template lang='pug'>

v-list-item(v-bind='$attrs' v-on='$listeners')
    v-list-item-content
        v-list-item-title
            slot

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

}

</script>


<style lang='sass' scoped>

</style>

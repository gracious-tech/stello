
<template lang='pug'>

v-alert(color='warning' text)
    template(#prepend)
        app-svg.icon(name='icon_privacy_tip')
    slot

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

}

</script>


<style lang='sass' scoped>

.icon
    margin-right: 12px
    width: 48px  // Stop from shrinking when message long

</style>

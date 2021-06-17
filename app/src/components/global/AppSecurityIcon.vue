
<template lang='pug'>

app-btn(icon='privacy_tip' color='#ffc400' :data-tip='msg')

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

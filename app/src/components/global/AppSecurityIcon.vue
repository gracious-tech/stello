
<template lang='pug'>

app-btn(icon='privacy_tip' color='warning' :data-tip='msg')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({type: String, default: ''}) msg!:string

}

</script>


<style lang='sass' scoped>


</style>

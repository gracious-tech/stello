
<template lang='pug'>

app-content.page(class='text-center')
    h1(class='title mt-10') Where did you want to go again??
    v-btn(to='/' text class='mt-5' color='accent') Nevermind

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'


@Component({})
export default class extends Vue {}

</script>


<style lang='sass' scoped>


</style>

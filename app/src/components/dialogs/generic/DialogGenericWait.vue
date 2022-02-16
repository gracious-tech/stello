
<template lang='pug'>

v-card
    v-card-title(class='justify-center') {{ title }}

    v-card-text(class='mt-4 text-center')
        v-progress-circular(indeterminate color='accent')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({default: ''}) declare readonly title:string
}

</script>


<style lang='sass' scoped>

</style>

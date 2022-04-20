
<template lang='pug'>

v-card(class='pa-8')
    v-card-title(class='justify-center') {{ title }}

    v-card-text(class='text-center noselect')
        v-progress-circular(:indeterminate='!total' :value='percent' :rotate='-90' :size='60'
            :width='6' color='accent' class='my-4')
        div(v-if='total') {{ progress }} of {{ total }}
        div(v-else-if='progress') {{ progress }}

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({type: String, default: ''}) declare readonly title:string
    @Prop({type: Number, default: 0}) declare readonly progress:number
    @Prop({type: Number}) declare readonly total:number|undefined

    get percent(){
        return this.total ? this.progress / this.total * 100 : undefined
    }
}

</script>


<style lang='sass' scoped>

</style>


<template lang='pug'>

v-card
    v-card-title {{ title }}

    v-card-text(class='mt-4')
        app-textarea(v-if='textarea' v-model='value' :label='label')
        app-text(v-else v-model='value' :label='label' @keyup.enter='done')

    v-card-actions
        app-btn(@click='$emit("close")') Cancel
        app-btn(@click='done') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({default: ''}) declare readonly label:string
    @Prop({default: ''}) declare readonly initial:string
    @Prop({default: ''}) declare readonly title:string
    @Prop({default: false}) declare readonly textarea:boolean

    value!:string

    created(){
        this.value = this.initial
    }

    done(){
        this.$emit('close', this.value)
    }
}

</script>


<style lang='sass' scoped>

</style>

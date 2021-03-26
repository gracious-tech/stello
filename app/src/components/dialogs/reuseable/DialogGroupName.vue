
<template lang='pug'>

v-card
    v-card-title Group's name

    v-card-text
        app-text(v-model='name' placeholder="Name..." class='mt-4')

    v-card-actions
        app-btn(@click='$emit("close")') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Group} from '@/services/database/groups'
import {debounce_set} from '@/services/misc'


@Component({})
export default class extends Vue {

    @Prop({required: true}) group:Group

    get name():string{
        return this.group.name
    }
    @debounce_set() set name(value:string){
        this.group.name = value
        self._db.groups.set(this.group)
    }
}

</script>


<style lang='sass' scoped>

</style>

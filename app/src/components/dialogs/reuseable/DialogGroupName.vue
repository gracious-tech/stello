
<template lang='pug'>

v-card
    v-card-title Group's name

    v-card-text
        app-text(v-model='name' @keyup.enter='done' placeholder="Name..." class='mt-4')

    v-card-actions
        app-btn(@click='done') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Group} from '@/services/database/groups'


@Component({})
export default class extends Vue {

    @Prop({required: true}) declare readonly group:Group

    get name():string{
        return this.group.name
    }
    set name(value:string){
        this.group.name = value
        self.app_db.groups.set(this.group)
    }

    done(){
        this.$emit('close')
    }
}

</script>


<style lang='sass' scoped>

</style>

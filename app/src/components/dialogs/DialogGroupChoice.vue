
<template lang='pug'>

v-card
    v-card-title Choose Group

    v-card-text
        v-list
            app-list-item(v-for='group of groups' @click='$emit("close", group)')
                | {{group.display}}

    v-card-actions
        app-btn(@click='$emit("close")') Cancel

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Group} from '@/services/database/groups'


@Component({})
export default class extends Vue {

    @Prop() groups:Group[]

}

</script>


<style lang='sass' scoped>

</style>

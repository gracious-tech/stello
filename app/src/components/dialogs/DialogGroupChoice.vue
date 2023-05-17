
<template lang='pug'>

v-card
    v-card-title Choose Group

    v-card-text
        v-list
            v-subheader Stello
            app-list-item(v-for='group of groups' :key='group.id' @click='$emit("close", group)')
                | {{group.display}}
            template(v-if='service_groups')
                v-subheader {{ service_name }}
                app-list-item(v-for='group of service_groups' :key='group.id'
                    @click='$emit("close", group)') {{group.display}}

    v-card-actions
        app-btn(@click='$emit("close")') Cancel

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Group} from '@/services/database/groups'


@Component({})
export default class extends Vue {

    @Prop({required: true}) declare readonly groups:Group[]
    @Prop({default: null}) declare readonly service_name:string|null
    @Prop({default: null}) declare readonly service_groups:Group[]|null

}

</script>


<style lang='sass' scoped>

</style>

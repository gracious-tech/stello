
<template lang='pug'>

div
    v-toolbar(color='primary' dark)
        app-btn(to='../' icon='arrow_back')
        v-toolbar-title Groups
        app-btn(to='../contacts/' color='' outlined class='ml-6') Contacts
        v-spacer
        app-btn.add(@click='new_group' icon='add' fab)

    app-content(class='pa-5')
        v-list
            route-groups-item(v-for='group of groups' :key='group.id' :group='group'
                @removed='load_groups')

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import RouteGroupsItem from './assets/RouteGroupsItem.vue'
import {sort} from '@/services/utils/arrays'


@Component({
    components: {RouteGroupsItem},
})
export default class extends Vue {

    groups = []

    created(){
        this.load_groups()
    }

    async load_groups(){
        const groups = await self._db.groups.list()
        sort(groups, 'name')  // NOTE Not using `display` so that empty names appear first
        this.groups = groups
    }

    async new_group(){
        // Create a new group and navigate to it
        const group = await self._db.groups.create()
        this.$router.push({name: 'group', params: {group_id: group.id}})
    }

}

</script>


<style lang='sass' scoped>

.add
    margin-top: 58px

</style>

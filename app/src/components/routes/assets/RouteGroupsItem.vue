
<template lang='pug'>

v-list-item(:to='to')
    v-list-item-content
        v-list-item-title {{ group.display }}
    v-list-item-action
        app-menu-more
            v-list-item(@click='remove')
                v-list-item-content
                    v-list-item-title Remove

</template>


<script lang='ts'>

import {Group} from '@/services/database/groups'
import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop() group:Group

    get to(){
        return {name: 'group', params: {group_id: this.group.id}}
    }

    remove(){
        self._db.groups.remove(this.group.id)
        this.$emit('removed')  // So list of groups knows it needs to reload
    }

}

</script>


<style lang='sass' scoped>


.v-list-item

    ::v-deep .menu-more-btn
        visibility: hidden

    &:hover ::v-deep .menu-more-btn
        visibility: visible


</style>

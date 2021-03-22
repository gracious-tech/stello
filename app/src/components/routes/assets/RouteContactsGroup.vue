
<template lang='pug'>

v-list-item.item(:value='group.id')
    v-list-item-content
        v-list-item-title {{ group.display }}
    v-list-item-action
        app-menu-more
            app-list-item(@click='rename') Rename
            app-list-item(@click='remove' color='error') Delete

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DialogGroupName from '@/components/dialogs/DialogGroupName.vue'
import {Group} from '@/services/database/groups'


@Component({})
export default class extends Vue {

    @Prop() group:Group

    rename(){
        // Show dialog that allows renaming the group
        this.$store.dispatch('show_dialog', {
            component: DialogGroupName,
            props: {group: this.group},
        })
    }

    remove(){
        // Remove the group from db and notify parent component
        self._db.groups.remove(this.group.id)
        this.$emit('removed', this.group)
    }

}

</script>


<style lang='sass' scoped>

.item
    padding-right: 0  // Menu icon has own padding

    .v-list-item__action
        margin: 0  // Doesn't need padding due to small icon
        visibility: hidden

    &:hover
        .v-list-item__action
            visibility: visible

</style>


<template lang='pug'>

v-list-item.item(:value='group.id')
    v-list-item-content
        v-list-item-title {{ group.display }}
    v-list-item-action
        app-menu-more
            app-list-item(@click='rename') Rename
            app-list-item(@click='remove' class='error--text') Delete

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DialogGenericText from '@/components/dialogs/generic/DialogGenericText.vue'
import {Group} from '@/services/database/groups'
import {task_manager} from '@/services/tasks/tasks'


@Component({})
export default class extends Vue {

    @Prop() declare readonly group:Group

    async rename(){
        // Show dialog that allows renaming the group
        const name = await this.$store.dispatch('show_dialog', {
            component: DialogGenericText,
            props: {
                title: "Group name",
                initial: this.group.name,
            },
        }) as string|undefined
        if (name){
            if (this.group.service_account){
                void task_manager.start_contacts_group_name(this.group.id, name)
            } else {
                this.group.name = name
                void self.app_db.groups.set(this.group)
            }
        }
    }

    async remove(){
        // Remove the group
        if (this.group.service_account){
            void task_manager.start_contacts_group_remove(this.group.id)
        } else {
            await self.app_db.groups.remove(this.group.id)
            this.$emit('removed', this.group)
        }
    }

}

</script>


<style lang='sass' scoped>

.item
    padding-right: 0  // Menu icon has own padding

    .v-list-item__action
        visibility: hidden

    &:hover
        .v-list-item__action
            visibility: visible

</style>


<template lang='pug'>

v-card
    v-card-title Recipients

    v-card-text

        template(v-if='!contacts || !contacts.length')
            p(class='text-center') You don't have any contacts yet
            p(class='text-center')
                app-btn(to='/contacts/') Add contacts

        v-tabs(v-else grow color='accent')
            v-tab Groups
            v-tab-item
                v-list
                    v-list-item(v-for='group of groups_ui' :key='group.id' @click='group.click'
                            :color='group.color')
                        v-list-item-icon
                            app-svg(:name='group.icon')
                        v-list-item-content
                            v-list-item-title {{ group.display }}

            v-tab Contacts
            v-tab-item

                v-chip-group(v-model='filter_contacts' mandatory class='pt-4'
                        active-class='accent--text')
                    v-chip All
                    v-chip Recipients
                    v-chip Non-Recipients

                v-list
                    v-list-item(v-for='contact of contacts_ui' :key='contact.id'
                            @click='contact.click' :color='contact.color')
                        v-list-item-icon
                            app-svg(:name='contact.icon')
                        v-list-item-content
                            v-list-item-title {{ contact.display }}

    v-card-actions
        app-btn(@click='dismiss') Close

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {sort, remove} from '@/services/utils/arrays'


@Component({})
export default class extends Vue {

    @Prop() draft
    groups = null
    contacts = null
    filter_contacts = 0

    created(){
        // Get all groups and contacts and sort them
        Promise.all([
            self._db.groups.list(),
            self._db.contacts.list(),
        ]).then(([groups, contacts]) => {
            this.groups = groups
            sort(this.groups, 'name')
            this.contacts = contacts
            sort(this.contacts, 'name')
        })
    }

    get groups_ui(){
        // A UI view of the groups data
        const items = []
        for (const group of this.groups){
            // Determine if the group is explicitly included or excluded
            const included = this.draft.recipients.include_groups.includes(group.id)
            const excluded = this.draft.recipients.exclude_groups.includes(group.id)
            // Return UI info for the group
            items.push({
                id: group.id,
                display: group.display,
                icon: 'icon_checkbox_' + (excluded ? 'cross' : (included ? 'true' : 'false')),
                color: excluded ? 'error' : (included ? 'accent' : ''),
                click: () => {this.toggle_group(group.id)},
            })
        }
        return items
    }

    get contacts_ui(){
        // A UI view of the contacts data

        // Get list of recipients that will currently be included when all things accounted for
        const final = this.draft.get_final_recipients(this.groups)

        const items = []
        for (const contact of this.contacts){
            // Don't show contacts depending on filtering setting
            const in_final = final.includes(contact.id)
            if (this.filter_contacts !== 0 && in_final !== (this.filter_contacts === 1)){
                continue
            }
            // Determine if the contact is explicitly included or excluded
            const included = this.draft.recipients.include_contacts.includes(contact.id)
            const excluded = this.draft.recipients.exclude_contacts.includes(contact.id)
            // Return UI info for the contact
            items.push({
                id: contact.id,
                display: contact.display,
                icon: 'icon_checkbox_' + (in_final ? 'true' : (excluded ? 'cross' : 'false')),
                color: excluded ? 'error' : (included ? 'accent' : ''),
                click: () => {this.toggle_contact(contact.id)},
            })
        }
        return items
    }

    toggle_group(group_id){
        // A three state toggle for groups: include -> exclude -> undefined
        if (this.draft.recipients.include_groups.includes(group_id)){
            // Was included, so now exclude
            remove(this.draft.recipients.include_groups, group_id)
            this.draft.recipients.exclude_groups.push(group_id)
        } else if (this.draft.recipients.exclude_groups.includes(group_id)){
            // Was excluded, so now leave undefined
            remove(this.draft.recipients.exclude_groups, group_id)
        } else {
            // Was undefined, so now include
            this.draft.recipients.include_groups.push(group_id)
        }
        self._db.drafts.set(this.draft)
    }

    toggle_contact(contact_id){
        // A three state toggle for contacts: include -> exclude -> undefined
        if (this.draft.recipients.include_contacts.includes(contact_id)){
            // Was included, so now exclude
            remove(this.draft.recipients.include_contacts, contact_id)
            this.draft.recipients.exclude_contacts.push(contact_id)
        } else if (this.draft.recipients.exclude_contacts.includes(contact_id)){
            // Was excluded, so now leave undefined
            remove(this.draft.recipients.exclude_contacts, contact_id)
        } else {
            // Was undefined, so now include
            this.draft.recipients.include_contacts.push(contact_id)
        }
        self._db.drafts.set(this.draft)
    }

    dismiss(){
        this.$store.dispatch('show_dialog', null)
    }

}

</script>


<style lang='sass' scoped>


</style>

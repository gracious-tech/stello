
<template lang='pug'>

div
    v-toolbar(color='primary' dark)
        app-btn(to='../' icon='arrow_back')
        v-toolbar-title {{ group && group.name }}
        v-spacer
        app-menu-more
            v-list-item(@click='remove')
                v-list-item-content
                    v-list-item-title Delete

    app-content(v-if='group' class='pa-5')

        v-text-field(v-model='name' label="Group Name" color='accent')

        div.filters
            app-btn(@click='toggle_all' :icon='all_included ? "checkbox_true" : "checkbox_false"'
                :color='all_included ? "accent" : ""')
            v-chip-group(v-model='filter' mandatory active-class='accent--text')
                v-chip All contacts
                v-chip Included
                v-chip Excluded

        v-list
            v-list-item(v-for='c of filtered_contacts' :key='c.id' @click='c.toggle'
                    :color='c.included ? "accent" : ""')
                v-list-item-icon
                    app-svg(:name='c.included ? "icon_checkbox_true" : "icon_checkbox_false"')
                v-list-item-title {{ c.display }}

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {debounce_set} from '@/services/misc'
import {sort} from '@/services/utils/arrays'
import {Contact} from '@/services/database/contacts'
import {Group} from '@/services/database/groups'


@Component({})
export default class extends Vue {

    @Prop() group_id:string
    group:Group = null
    possible_contacts:Contact[] = []
    filter:number = 0

    created(){
        // Ensure get group and contacts at same time so group's contacts' info exists
        Promise.all([
            self._db.groups.get(this.group_id),
            self._db.contacts.list(),
        ]).then(([group, contacts]) => {
            this.possible_contacts = contacts
            sort(this.possible_contacts, 'name')
            this.group = group
        })
    }

    get name():string{
        return this.group.name
    }

    @debounce_set() set name(value:string){
        this.group.name = value.trim()
        self._db.groups.set(this.group)
    }

    get all_included():boolean{
        // Whether all possible contacts are included in the group
        return this.possible_contacts.every(contact => this.group.contacts.includes(contact.id))
    }

    get filtered_contacts(){
        // Return list of filtered contacts with info needed for list item functionality
        let contacts = this.possible_contacts
        if (this.filter !== 0){
            contacts = contacts.filter(c => {
                return this.filter === 1 === this.group.contacts.includes(c.id)
            })
        }
        return contacts.map(c => {
            return {
                id: c.id,
                display: c.display,
                included: this.group.contacts.includes(c.id),
                toggle: () => {this.toggle_contact(c.id)},
            }
        })
    }

    toggle_contact(contact_id:string):void{
        // Toggle the given contact id's inclusion in the group's contacts
        if (this.group.contacts.includes(contact_id)){
            this.group.contacts = this.group.contacts.filter(c_id => c_id !== contact_id)
        } else {
            this.group.contacts.push(contact_id)
        }
        self._db.groups.set(this.group)
    }

    toggle_all():void{
        // Toggle the inclusion of all contacts
        if (this.all_included){
            this.group.contacts = []
        } else {
            this.group.contacts = this.possible_contacts.map(c => c.id)
        }
        self._db.groups.set(this.group)
    }

    remove(){
        self._db.groups.remove(this.group_id)
        this.$router.push('../')
    }

}

</script>


<style lang='sass' scoped>

.filters
    display: flex
    align-items: center
    margin-left: 4px  // Keep inline with list items

    .v-btn
        margin-right: 18px

</style>

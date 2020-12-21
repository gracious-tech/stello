
<template lang='pug'>

div
    v-toolbar(color='primary' dark)
        app-btn(to='../' icon='arrow_back')
        v-toolbar-title {{ contact && contact.name }}

    app-content(v-if='contact' class='pa-5')

        v-text-field(v-model='name' label="Full Name" color='accent')

        v-text-field(v-model='name_hello' :placeholder='contact.name_hello_result' label="Hello Name"
            color='accent'
            hint="The name used to address this contact in messages (defaults to first name)")

        v-text-field(v-model.trim='address' label="Contact method" color='accent'
            hint="Can be 1. email address 2. link to chat window 3. blank (manual send)")

        v-textarea(v-model='notes' label="Notes" color='accent')

        app-select(v-model='groups' :items='possible_groups_items' multiple label="Groups")

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {debounce_set} from '@/services/misc'


@Component({})
export default class extends Vue {

    @Prop() contact_id
    contact = null
    possible_groups = []

    created(){
        // Ensure get groups and contact at same time so contact's groups' info exists
        Promise.all([
            self._db.contacts.get(this.contact_id),
            self._db.groups.list(),
        ]).then(([contact, groups]) => {
            this.possible_groups = groups
            this.contact = contact
        })
    }

    get name(){
        return this.contact.name
    }

    @debounce_set() set name(value){
        this.contact.name = value
        self._db.contacts.set(this.contact)
    }

    get name_hello(){
        return this.contact.name_hello
    }

    @debounce_set() set name_hello(value){
        this.contact.name_hello = value
        self._db.contacts.set(this.contact)
    }

    get address(){
        return this.contact.address
    }

    @debounce_set() set address(value){
        this.contact.address = value
        self._db.contacts.set(this.contact)
    }

    get notes(){
        return this.contact.notes
    }

    @debounce_set() set notes(value){
        this.contact.notes = value
        self._db.contacts.set(this.contact)
    }

    get possible_groups_items(){
        // Return possible groups in format that v-select understands
        return this.possible_groups.map(group => {
            return {
                value: group.id,
                text: group.display,
            }
        })
    }

    get groups(){
        // Array of group ids that contact belongs to
        return this.possible_groups
            .filter(g => g.contacts.includes(this.contact.id))
            .map(g => g.id)
    }

    set groups(group_ids){
        // Change the groups that the contact belongs to
        for (const group of this.possible_groups){
            // Detect if membership has changed for this group
            if (group_ids.includes(group.id) !== group.contacts.includes(this.contact.id)){
                // Either add or remove the contact from the group
                if (group_ids.includes(group.id)){
                    group.contacts.push(this.contact.id)
                } else {
                    group.contacts = group.contacts.filter(c => c !== this.contact.id)
                }
                // Save changes
                self._db.groups.set(group)
            }
        }
    }

}

</script>


<style lang='sass' scoped>


</style>

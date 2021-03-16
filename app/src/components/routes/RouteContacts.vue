
<template lang='pug'>

div
    v-toolbar.navbar
        v-toolbar-title Contacts
        v-spacer
        app-btn.fab(@click='new_contact' icon='add' fab)
        app-menu-more
            app-list-item(@click='show_import_dialog') Import contacts

    v-toolbar.filterbar(class='text--secondary')

        div.selecting(:class='{invisible: !some_selected}')
            app-btn-checkbox(@click='bulk_toggle' :value='bulk_value')
            span.selected Selected {{ contacts_selected.length }} of {{ contacts.length }}
            app-menu-more
                app-list-item(@click='delete_selected') Delete selected

        input(v-model.trim='search' placeholder="Search...")
        app-btn(v-if='search' @click='search = ""' icon='close')

    app-content(class='pa-5')
        div.empty(v-if='!contacts.length')
            p(class='text-h5 text--secondary noselect') No contacts added yet
            app-btn(@click='show_import_dialog') Import contacts
        v-list.contacts(:class='{selections: some_selected}')
            route-contacts-item(v-for='contact of contacts_visible' :key='contact.id'
                :contact='contact')
        p(v-if='contacts.length > contacts_visible.length' class='text-center')
            app-btn(@click='reveal_more')
                | {{ contacts_matched > contacts_visible ? "Show all" : "clear search" }}

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import RouteContactsItem from './assets/RouteContactsItem.vue'
import DialogContactsImport from '@/components/dialogs/DialogContactsImport.vue'
import {sort} from '@/services/utils/arrays'


interface UIContact {
    id:string
    display:string
    selected:boolean
}


@Component({
    components: {RouteContactsItem},
})
export default class extends Vue {

    contacts:UIContact[] = []
    search = ''
    limit_visible = true  // So don't make UI laggy if user won't check them all anyway

    created(){
        this.load_contacts()
    }

    get contacts_matched(){
        // The contacts matched by search query (or all if no query)
        const lower_search = this.search.toLowerCase()
        let contacts = this.contacts
        if (this.search){
            contacts = contacts.filter(contact => {
                return contact.display.toLowerCase().includes(lower_search)
            })
        }
        return contacts
    }

    get contacts_visible(){
        // The contacts present in the DOM
        return this.limit_visible ? this.contacts_matched.slice(0, 100) : this.contacts_matched
    }

    get contacts_selected(){
        // The contacts currently selected (whether visible or not)
        return this.contacts.filter(contact => contact.selected)
    }

    get some_selected(){
        // Whether some contacts have been selected or not
        return this.contacts_selected.length !== 0
    }

    get all_selected(){
        // Whether all contacts have been selected
        return this.contacts.length && this.contacts_selected.length === this.contacts.length
    }

    get bulk_value(){
        return this.all_selected ? true : (this.some_selected ? null : false)
    }

    async load_contacts(){
        // Generate a UI view of contacts
        const contacts = await self._db.contacts.list()
        sort(contacts, 'name')  // NOTE Not using `display` so that empty names appear first
        this.contacts = contacts.map(contact => {
            return {
                id: contact.id,
                display: contact.display,
                selected: false,
            }
        })
    }

    async new_contact(){
        // Create a new contact and navigate to it
        const contact = await self._db.contacts.create()
        this.$router.push({name: 'contact', params: {contact_id: contact.id}})
    }

    reveal_more(){
        // Make more contacts visible, either by clearing limit or clearing search query
        if (this.contacts_matched > this.contacts_visible){
            this.limit_visible = false
        } else {
            this.search = ''
        }
    }

    show_import_dialog(){
        // Open dialog for importing contacts
        this.$store.dispatch('show_dialog', {
            component: DialogContactsImport,
            props: {done: this.load_contacts},
        })
    }

    bulk_toggle(){
        // Select all if not all selected, else select none
        const value_for_all = !this.all_selected
        this.contacts.forEach(contact => {
            contact.selected = value_for_all
        })
    }

    async delete_selected(){
        // Delete selected contacts
        this.contacts_selected.forEach(contact => {
            self._db.contacts.remove(contact.id)
        })
        this.$store.dispatch('show_snackbar', `Deleted ${this.contacts_selected.length} contacts`)
        // Remove deleted from list by filtering them out
        this.contacts = this.contacts.filter(contact => !contact.selected)
    }

}

</script>


<style lang='sass' scoped>

.navbar
    z-index: 1  // Keep above secondary toolbar

    .fab
        margin-top: 64px

.filterbar

    ::v-deep .v-toolbar__content

        .selecting
            display: flex
            align-items: center
            margin-right: 36px

            .selected
                white-space: nowrap
                margin: 0 6px

        input
            color: rgba($on_primary_darker, 1)  // Full opacity since user's own text
            width: 100%
            max-width: 300px
            outline-style: none
            font-size: 20px
            margin: 6px

            &::placeholder
                color: rgba($on_primary, 0.6)

.empty
    text-align: center
    padding-top: 50px

::v-deep .contacts.selections .v-btn
    visibility: visible


</style>

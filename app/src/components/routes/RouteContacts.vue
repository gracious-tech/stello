
<template lang='pug'>

div
    v-toolbar.navbar
        v-toolbar-title Contacts
        v-spacer
        template(v-if='some_selected')
            app-btn-checkbox(@click='bulk_toggle' :value='bulk_value')
            span(class='text--secondary')
                | {{ contacts_selected.length }} of {{ contacts.length }} selected
            app-menu-more
                app-list-item(@click='do_selected_new_draft') New message
                v-divider
                app-list-item(@click='do_selected_new_group') Create new group
                app-list-item(@click='do_selected_join_group') Add to a group
                app-list-item(@click='do_selected_leave_group'
                        :disabled='!filter_group || !!filter_group.service_id')
                    | {{ filter_group ? `Remove from "${filter_group.display}"` : "Remove from group" }}
                v-divider
                app-list-item(@click='do_selected_export') Export selected
                app-list-item(@click='do_selected_delete' color='error'
                    :disabled='!contacts_selected_internal.length') Delete selected
                v-divider
                app-list-item(@click='do_selected_invert') Invert selection
        span(v-else-if='search || filter_group' class='text--secondary')
            | {{ contacts_matched.length }} of {{ contacts.length }}
            | {{ search ? "matched" : "included" }}
        v-spacer
        app-btn.fab(@click='new_contact' icon='add' fab)

    div.groups_contacts

        div.groups(v-if='something_added' :class='{searching: !!search}')
            app-text.search(v-model='search' placeholder="Search...")
                template(#append)
                    app-btn(v-if='search' @click='search = ""' icon='close')
            v-list(dense)
                v-list-item-group(v-model='filter_group_id' color='accent')
                    app-list-item(value='-') All contacts
                    v-divider
                    v-subheader Groups
                    route-contacts-group(v-for='group of groups_internal' :group='group'
                        @removed='on_group_removed')
                    div(class='text-center')
                        app-btn(@click='new_group' small class='mt-2') New group
                    template(v-for='account of accounts')
                        v-divider
                        v-subheader
                            div.account_name(class='ellipsis') {{account.display}}
                            app-btn(@click='account.sync' icon='sync')
                        app-list-item(v-for='group of account.groups' :value='group.id')
                            | {{group.display}}
                    v-divider
                    div(class='text-center')
                        app-btn(@click='show_import_dialog' small) Import contacts

        app-content(class='pa-5' ref='scrollable')
            div.empty(v-if='!contacts.length')
                p(class='text-h5 text--secondary noselect') No contacts added yet
                app-btn(@click='show_import_dialog') Import contacts
            v-list.contacts(:class='{selections: some_selected}')
                route-contacts-item(v-for='item of contacts_visible' :key='item.contact.id'
                    :item='item')
            p(v-if='contacts.length > contacts_visible.length' class='text-center')
                app-btn(@click='reveal_more' small) {{ reveal_more_label }}

</template>


<script lang='ts'>

import papaparse from 'papaparse'
import {uniq} from 'lodash'
import {Component, Vue, Watch} from 'vue-property-decorator'

import DialogGroupChoice from '../dialogs/DialogGroupChoice.vue'
import DialogGroupName from '../dialogs/reuseable/DialogGroupName.vue'
import DialogContactsImport from '@/components/dialogs/DialogContactsImport.vue'
import RouteContactsItem from './assets/RouteContactsItem.vue'
import RouteContactsGroup from './assets/RouteContactsGroup.vue'
import {remove, sort} from '@/services/utils/arrays'
import {download_file} from '@/services/utils/misc'
import {Group} from '@/services/database/groups'
import {Contact} from '@/services/database/contacts'
import {Task} from '@/services/tasks/tasks'


interface ContactItem {
    contact:Contact
    selected:boolean
}


@Component({
    components: {RouteContactsItem, RouteContactsGroup},
})
export default class extends Vue {

    contacts:ContactItem[] = []
    groups:Group[] = []
    accounts:{id:string, display:string, groups:Group[], sync:()=>Promise<Task>}[] = []

    filter_group_id:string = '-'  // Special value for null as empty values don't get highlighted
    search:string = ''
    pages_visible:number = 1  // So don't make UI laggy if user won't check them all anyway

    created():void{
        // Default to filtering by the group specified in route query if any
        if (this.$route.query.group){
            this.filter_group_id = this.$route.query.group as string
        }
        this.load_contacts()
    }

    // Lists of contacts

    get contacts_matched():ContactItem[]{
        // The contacts matched by active filter (group or search)
        // TODO Search that is more flexible with accents/fuzzy etc (Intl.Collator useful?)
        if (this.search){
            const lower_search = this.search.toLowerCase()
            return this.contacts.filter(
                item => item.contact.display.toLowerCase().includes(lower_search))
        } else if (this.filter_group){
            return this.contacts.filter(
                item => this.filter_group.contacts.includes(item.contact.id))
        }
        return this.contacts
    }

    get contacts_visible():ContactItem[]{
        // The contacts present in the DOM
        return this.contacts_matched.slice(0, 100 * this.pages_visible)
    }

    get contacts_selected():ContactItem[]{
        // The contacts currently selected (whether visible or not)
        return this.contacts.filter(item => item.selected)
    }

    get contacts_selected_internal():ContactItem[]{
        // The selected contacts that aren't synced from a service account
        return this.contacts_selected.filter(item => !item.contact.service_account)
    }

    // Lists of groups

    get groups_internal():Group[]{
        return this.groups.filter(group => !group.service_account)
    }

    // Other getters

    get something_added():boolean{
        // Whether user has added something, whether group/contact/account, i.e. not new to Stello
        return !! (this.contacts.length || this.groups.length || this.accounts.length)
    }

    get filter_group():Group{
        // The group being used to filter contacts
        if (this.search || this.filter_group_id === '-')
            return null
        return this.groups.find((g => g.id === this.filter_group_id))
    }

    get some_selected():boolean{
        // Whether some contacts have been selected or not
        return this.contacts_selected.length !== 0
    }

    get all_selected():boolean{
        // Whether all contacts have been selected (doesn't count if no contacts exist)
        return this.contacts.length && this.contacts_selected.length === this.contacts.length
    }

    get bulk_value():boolean{
        // What value the bulk select checkbox should have
        return this.all_selected ? true : (this.some_selected ? null : false)
    }

    get reveal_more_label():string{
        // The text for the reveal more button
        if (this.contacts_matched > this.contacts_visible){
            return "Show more"
        }
        return this.search ? "Clear search" : "Deselect group"
    }

    // Watch

    @Watch('filter_group_id') watch_filter_group_id():void{
        // Clear search and/or selected whenever filter by a group triggered
        // NOTE This includes when showing all contacts ('-')
        // NOTE This still allows preserving selections across different searches (but not groups)
        this.search = ''
        this.clear_selected()
    }

    @Watch('contacts_matched') watch_contacts_matched():void{
        // Whenever matched contacts changes, scroll back to top and show only one page of contacts
        ;(this.$refs.scrollable as Vue).$el.scroll(0, 0)
        this.pages_visible = 1
    }

    @Watch('$tm.data.finished') watch_tm_finished(task:Task){
        // Listen to task completions and adjust state as needed
        // TODO handle more events
        if (task.name === 'contacts_remove'){
            remove(this.contacts, task.params[1], (ai, i) => ai.contact.id === i)
        } else if (task.name === 'contacts_sync'){
            this.load_contacts()
        }
    }

    // Methods

    async load_contacts():Promise<void>{
        // Load all contacts and groups from db
        let [contacts, groups, oauths] = await Promise.all([
            self._db.contacts.list(),
            self._db.groups.list(),
            self._db.oauths.list(),
        ])

        // Only consider oauths that have contact syncing enabled
        oauths = oauths.filter(oauth => oauth.contacts_sync)

        // Sort all
        // NOTE Not using `display` so that empty names appear first
        sort(contacts, 'name')
        sort(groups, 'name')
        sort(oauths, 'email')

        // Wrap contacts in container so selected state can be kept with them
        this.contacts = contacts.map(contact => {
            return {
                contact,
                selected: false,
            }
        })

        // Expose groups as is
        this.groups = groups

        // Turn oauths into "accounts" and add the groups that belong to them
        this.accounts = oauths.map(oauth => {
            return {
                id: oauth.service_account,
                display: oauth.display,
                groups: groups.filter(group => group.service_account === oauth.service_account),
                sync: () => this.$tm.start_contacts_sync(oauth.id),
            }
        })
    }

    async new_contact():Promise<void>{
        // Create a new contact and navigate to it
        const contact = await self._db.contacts.create()
        if (this.filter_group && !this.filter_group.service_id){
            // Auto-add contact to currently selected group (but NOT a service account group)
            this.filter_group.contacts.push(contact.id)
            await self._db.groups.set(this.filter_group)
        }
        this.$router.push({name: 'contact', params: {contact_id: contact.id}})
    }

    async new_group():Promise<void>{
        // Create a new group
        const group = await self._db.groups.create()

        // Add group to array, prompt for name, then resort when done
        this.groups.push(group)
        await this.$store.dispatch('show_dialog', {component: DialogGroupName, props: {group}})
        sort(this.groups, 'name')

        // Select the group so user can see the changes have happened
        this.filter_group_id = group.id
        this.search = ''

        // Clear any selection so user doesn't get confused
        this.clear_selected()
    }

    reveal_more():void{
        // Make more contacts visible, either by clearing limit or clearing a filter
        if (this.contacts_matched > this.contacts_visible){
            this.pages_visible *= 2  // Increase exponentially so quicker for those who want all
        } else if (this.search){
            this.search = ''
        } else {
            this.filter_group_id = '-'
        }
    }

    async show_import_dialog():Promise<void>{
        // Open dialog for importing contacts
        // NOTE Import dialog returns id of group of all the new contacts if any
        const group_id = await this.$store.dispatch('show_dialog', {
            component: DialogContactsImport,
            wide: true,
        })
        if (group_id){
            // New group and contacts so just load fresh from db and display the new group
            this.load_contacts()
            this.filter_group_id = group_id
            this.search = ''
        }
    }

    // Selection changing

    bulk_toggle():void{
        // Select all if not all selected, else select none
        const value_for_all = !this.all_selected
        for (const item of this.contacts){
            item.selected = value_for_all
        }
    }

    clear_selected():void{
        // Deselect all contacts
        for (const item of this.contacts){
            item.selected = false
        }
    }

    // Actions on selected

    do_selected_invert():void{
        // Invert which contacts are selected
        for (const item of this.contacts){
            item.selected = !item.selected
        }
    }

    do_selected_delete():void{
        // Delete selected contacts (but only those not part of a service account)
        for (const item of this.contacts_selected_internal){
            self._db.contacts.remove(item.contact.id)
        }

        // Notify how many deleted/skipped
        const count = this.contacts_selected_internal.length
        const skipped = this.contacts_selected.length - count
        const skipped_text = skipped ? `(skipped ${skipped} synced contacts)` : ''
        this.$store.dispatch('show_snackbar', `Deleted ${count} contacts ${skipped_text}`)

        // Remove deleted from list by filtering them out
        this.contacts = this.contacts.filter(item => !item.selected || item.contact.service_account)
    }

    do_selected_export():void{
        // Export selected contacts as CSV
        const data = [['name', 'name_address_as', 'email', 'notes']]
        data.push(...this.contacts_selected.map(c => {
            return [
                c.contact.name,
                c.contact.name_hello_result,
                c.contact.address,
                c.contact.notes,
            ]
        }))
        const csv = papaparse.unparse(data)
        download_file(new File([csv], 'stello_contacts.csv'))
    }

    async do_selected_new_group():Promise<void>{
        // Create a new group with currently selected contacts in it
        const contact_ids = this.contacts_selected.map(c => c.contact.id)
        const group = await self._db.groups.create('', contact_ids)

        // Add new group to array, prompt for name, then re-sort all
        this.groups.push(group)
        await this.$store.dispatch('show_dialog', {component: DialogGroupName, props: {group}})
        sort(this.groups, 'name')

        // Select the group so user can see the changes have happened
        this.filter_group_id = group.id
        this.search = ''

        // Clear any selection so user doesn't get confused
        this.clear_selected()
    }

    async do_selected_join_group():Promise<void>{
        // Prompt user to choose a group to add selected contacts to
        const group:Group = await this.$store.dispatch('show_dialog', {
            component: DialogGroupChoice,
            props: {groups: this.groups_internal},  // WARN Cannot join external groups
        })
        if (group){
            // Add contacts to the group and remove any duplicates
            group.contacts.push(...this.contacts_selected.map(item => item.contact.id))
            group.contacts = uniq(group.contacts)
            self._db.groups.set(group)
            // Select the group so user can see the changes have happened
            this.filter_group_id = group.id
            this.search = ''
            // Clear selection so user doesn't get confused
            this.clear_selected()
        }
    }

    do_selected_leave_group():void{
        // Remove selected contacts from currently selected group (if not external)
        if (this.filter_group && !this.filter_group.service_account){
            const selected_ids = this.contacts_selected.map(item => item.contact.id)
            this.filter_group.contacts = this.filter_group.contacts.filter(
                id => !selected_ids.includes(id))
            self._db.groups.set(this.filter_group)
            // Clear selection so user doesn't get confused
            this.clear_selected()
        }
    }

    async do_selected_new_draft():Promise<void>{
        // Create a new draft and add selected contacts as recipients
        // NOTE Does NOT use the default template if any
        const draft = await self._db.drafts.create_object()
        draft.recipients.include_contacts = this.contacts_selected.map(item => item.contact.id)
        await self._db.drafts.set(draft)
        this.$router.push({name: 'draft', params: {draft_id: draft.id}})
    }

    // Event handlers

    on_group_removed(group:Group):void{
        // When a group is removed, also remove from this component's array
        remove(this.groups, group)
    }
}

</script>


<style lang='sass' scoped>

.navbar
    z-index: 1  // Prevent list items overlapping fav icon
    .fab
        margin-top: 64px

.groups_contacts
    flex-grow: 1
    display: flex
    overflow-y: hidden  // Stop toolbar scrolling with content

    .groups
        display: flex
        flex-direction: column
        min-width: 250px
        max-width: 250px
        @include themed(background-color, $primary_lighter, $primary_darker)
        @include themed(color,  $on_primary_lighter, $on_primary_darker)

        &.searching
            // Don't suggest that a group is selected when searching (even if it is)
            .v-list-item
                @include themed(color, #000, #fff)
            .v-list-item::before
                opacity: 0  // Don't highlight selected group while searching as it doesn't apply then

        ::v-deep .search
            flex-grow: 0
            .v-input__slot
                padding-right: 0  // Clear button has padding already
                margin-bottom: 0  // No space before scrolling groups list
            .v-text-field__details
                display: none  // Won't show any error messages
            .v-input__append-inner
                // Vertically center clear button for search
                margin-top: 0
                align-self: center

        .v-list
            overflow-y: auto
            padding-bottom: 100px

            .account_name
                width: 100%

.empty
    text-align: center
    padding-top: 50px

// Show selection checkbox for all contacts whenever any are selected
::v-deep .contacts.selections .v-btn
    visibility: visible


</style>


<template lang='pug'>

div
    v-toolbar.navbar
        v-toolbar-title Contacts
        v-spacer
        template(v-if='some_selected')
            app-btn-checkbox(@click='bulk_toggle' :value='bulk_value')
            span(class='text--secondary')
                | {{ contacts_selected.length }} of
                |
                //- Show all total if showing all OR if searching
                | {{ filter_group_id === '-' ? contacts.length : contacts_matched.length}} selected
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
        span(v-else-if='search || filter_group' class='text--secondary')
            | {{ contacts_matched.length }} {{ search ? "matched" : "included" }}
        v-spacer
        app-btn.fab(@click='new_contact' icon='add' fab)

    div.groups_contacts

        div.groups(v-if='something_added' class='app-bg-primary-relative')
            app-text.search(v-model='search' placeholder="Search...")
                template(#append)
                    app-btn(v-if='search' @click='search = ""' icon='close')
            v-list(dense)
                v-list-item-group(v-model='filter_group_id' mandatory color='accent')
                    app-list-item(value='-') All contacts
                    v-divider
                    v-subheader Groups
                    route-contacts-group(v-for='group of groups_internal' :key='group.id'
                        :group='group' @removed='on_group_removed')
                    div(class='text-center')
                        app-btn(@click='new_group' small class='mt-2') New group
                    template(v-for='account of accounts')
                        v-divider
                        v-subheader
                            div.account_name(class='ellipsis') {{account.display}}
                            app-btn(@click='account.sync' icon='sync')
                        app-list-item(v-for='group of account.groups' :key='group.id'
                            :value='group.id') {{group.display}}
                    v-divider
                    div(class='text-center')
                        app-btn(@click='show_import_dialog' small) Import contacts

        div.contacts(:class='{selections: some_selected}')

            div(v-if='!contacts_matched.length' class='text-center pt-16 mt-16')
                p(class='text-h5 text--secondary noselect') {{ empty_list_explanation }}
                app-btn(@click='empty_list_action') {{ empty_list_action_label }}

            app-content-list(v-else :items='contacts_matched' ref='scrollable' height='48'
                    class='pt-6')
                template(#default='{item, height_styles}')
                    route-contacts-item(:item='item' :key='item.contact.id' :style='height_styles')

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
import {remove_item, remove_match, remove_matches, sort} from '@/services/utils/arrays'
import {download_file} from '@/services/utils/misc'
import {sleep} from '@/services/utils/async'
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

    filter_group_id = '-'  // Special value for null as empty values don't get highlighted
    search = ''

    async mounted():Promise<void>{
        // Load contacts and init filters
        // NOTE Some logic relies on DOM, so doing in `mounted` rather than `created`

        // Default to filtering by the group specified in route query if any
        // NOTE If viewed a contact and then `back()`, `prev_state_contacts` should override this
        if (this.$route.query['group']){
            this.filter_group_id = this.$route.query['group'] as string
        }

        // Load contacts and other data
        await this.load_contacts()

        // If returning from viewing a contact, restore previous filtering state
        const prev_route = this.$store.state.tmp.prev_route
        const prev_state_contacts = this.$store.state.tmp.prev_state_contacts
        if (prev_route.name === 'contact' && prev_state_contacts){

            // Restore search and group filter state
            this.search = prev_state_contacts.search
            this.filter_group_id = prev_state_contacts.filter_group_id

            // Wait for DOM to change after above filters applied
            this.$nextTick(async ():Promise<void> => {
                const scrollable = (this.$refs['scrollable'] as Vue)?.$el as HTMLDivElement
                if (scrollable){
                    // Restore previous scroll position
                    scrollable.scrollTop = prev_state_contacts.scroll_top
                    // Wait for virtual scroll to render visible items ($nextTick doesn't work)
                    await sleep(1)
                    // Focus the contact just came from (if it still exists)
                    scrollable.querySelector<HTMLAnchorElement>
                        (`[href='#/contacts/${prev_route.params.contact_id}/']`)?.focus()
                }
            })
        }
    }

    beforeDestroy():void{
        // Preserve state and scroll position when leaving contacts list
        this.$store.commit('tmp_set', ['prev_state_contacts', {
            filter_group_id: this.filter_group_id,
            search: this.search,
            scroll_top: (this.$refs['scrollable'] as Vue)?.$el.scrollTop || 0,
        }])
    }

    // Lists of contacts

    get contacts_matched():ContactItem[]{
        // The contacts matched by active filter (group or search)
        // TODO Search that is more flexible with accents/fuzzy etc (Intl.Collator useful?)
        if (this.search){
            const lower_search = this.search.toLowerCase()
            return this.contacts.filter(item => {
                return item.contact.name.toLowerCase().includes(lower_search)
                || item.contact.name_hello.toLowerCase().includes(lower_search)
                || item.contact.address.toLowerCase().includes(lower_search)
            })
        } else if (this.filter_group){
            return this.contacts.filter(
                item => this.filter_group.contacts.includes(item.contact.id))
        }
        return this.contacts
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
        // Whether some contacts (not necessarily matched) have been selected or not
        return this.contacts_selected.length !== 0
    }

    get all_matched_selected():boolean{
        // Whether all MATCHED contacts have been selected (doesn't count if no contacts matched)
        return !!this.contacts_matched.length && this.contacts_matched.every(i => i.selected)
    }

    get bulk_value():boolean{
        // What value the bulk select checkbox should display as
        return this.all_matched_selected ? true : (this.some_selected ? null : false)
    }

    get empty_list_explanation():string{
        // Text that explains why list is empty
        if (!this.contacts.length){
            return "No contacts added yet"
        } else if (this.search.length){
            return "No matches"
        }
        return "Group empty"
    }

    get empty_list_action_label():string{
        // Text for button when list is empty
        if (!this.contacts.length){
            return "Import contacts"
        } else if (this.search.length){
            return "Clear search"
        }
        return "New contact"
    }

    // Watch

    @Watch('search') watch_search(value:string):void{
        // Search always applies to whole list and deselects any previous group selection
        if (value){
            this.filter_group_id = '-'
        }
    }

    @Watch('filter_group_id') watch_filter_group_id(value:string):void{
        // Clear search and/or selected whenever filter by a group triggered
        // NOTE Not clearing when going back to "all contacts"
        //      i.e. it's possible to select some in group, and keep selections for all view
        //      Preserving selections across different searches is also supported
        if (value !== '-'){
            this.search = ''
            this.clear_selected()
        }
    }

    @Watch('contacts_matched') watch_contacts_matched():void{
        // Whenever matched contacts changes, scroll back to top
        ;(this.$refs['scrollable'] as Vue)?.$el.scroll(0, 0)
    }

    @Watch('$tm.data.finished') watch_tm_finished(task:Task){
        // Listen to task completions and adjust state as needed
        // TODO handle more events
        if (task.name === 'contacts_remove'){
            remove_match(this.contacts, item => item.contact.id === task.params[1])
        } else if (task.name === 'contacts_sync'){
            this.load_contacts()
        }
    }

    // Methods

    async load_contacts():Promise<void>{
        // Load all contacts and groups from db
        const [contacts, groups, oauths] = await Promise.all([
            self._db.contacts.list(),
            self._db.groups.list(),
            self._db.oauths.list(),
        ])

        // Only consider oauths that have contact syncing enabled
        remove_matches(oauths, oauth => !oauth.contacts_sync)

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

    empty_list_action():void{
        // Action for button displayed when list is empty
        if (!this.contacts.length){
            this.show_import_dialog()
        } else if (this.search.length){
            this.search = ''
        } else {
            this.new_contact()
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
        // Select all matched contacts if not all selected, else select none
        const value_for_all = !this.all_matched_selected

        // Ensure all current selections are cleared, as confusing if non-matched still included
        // NOTE Preserving selection of non-matched items is supported for searches only
        this.clear_selected()

        // Now apply bulk value to all MATCHED contacts
        for (const item of this.contacts_matched){
            item.selected = value_for_all
        }
    }

    clear_selected():void{
        // Deselect all contacts
        for (const item of this.contacts_selected){
            item.selected = false
        }
    }

    // Actions on selected

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

        // Remove deleted from list
        for (const item of this.contacts_selected_internal){
            remove_item(this.contacts, item)
        }
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
            for (const item of this.contacts_selected){
                remove_item(this.filter_group.contacts, item.contact.id)
            }
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
        remove_item(this.groups, group)
    }
}

</script>


<style lang='sass' scoped>


$groups_sidebar_width: 250px


.navbar
    z-index: 1  // Prevent list items overlapping fav icon
    padding-left: $groups_sidebar_width
    .fab
        margin-top: 64px

.groups_contacts
    flex-grow: 1
    display: flex
    overflow-y: hidden  // Stop toolbar scrolling with content

    .groups
        display: flex
        flex-direction: column
        min-width: $groups_sidebar_width
        max-width: $groups_sidebar_width

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

    .contacts
        display: flex
        flex-direction: column
        width: 100%

        ::v-deep .v-virtual-scroll__container
            max-width: 800px  // Make wider


// Show selection checkbox for all contacts whenever any are selected
::v-deep .contacts.selections .v-btn
    visibility: visible


</style>

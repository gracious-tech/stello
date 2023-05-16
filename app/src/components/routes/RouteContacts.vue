
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
                app-list-item(@click='do_selected_delete' class='error--text'
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
                        route-contacts-group(v-for='group of account.groups' :key='group.id'
                            :group='group' @removed='on_group_removed')
                    v-divider
                    v-subheader Management
                    app-list-item(value='duplicates') Duplicates
                    app-list-item(value='disengaged') Disengaged
                    div(class='text-center mt-2')
                        app-btn(@click='show_import_dialog' small) Import contacts

        div.contacts(:class='{selections: some_selected}')

            div(v-if='filter_group_id === "disengaged"'
                    class='app-bg-primary-relative py-4 px-15 text-body-2 text-center')
                | Contacts who were sent messages but didn't open them<br>
                strong Messages unopened (since last open)&nbsp;&nbsp;|&nbsp;&nbsp;Last time opened

            div(v-if='!contacts_matched.length' class='text-center pt-16 mt-16')
                p(class='text-h5 text--secondary noselect') {{ empty_list_explanation }}
                app-btn(v-if='empty_list_action_label' @click='empty_list_action')
                    | {{ empty_list_action_label }}

            app-content-list(v-else :items='contacts_matched' ref='scrollable' height='48'
                    class='pt-6')
                template(#default='{item, height_styles}')
                    route-contacts-item(:item='item' :key='item.contact.id' :style='height_styles'
                        :disengaged='filter_group_id === "disengaged"')

</template>


<script lang='ts'>

import papaparse from 'papaparse'
import {uniq} from 'lodash'
import {Component, Vue, Watch} from 'vue-property-decorator'

import DialogGroupChoice from '../dialogs/DialogGroupChoice.vue'
import DialogGroupName from '../dialogs/reuseable/DialogGroupName.vue'
import DialogContactsImport from '@/components/dialogs/DialogContactsImport.vue'
import DialogNewContact from '@/components/dialogs/reuseable/DialogNewContact.vue'
import RouteContactsItem from './assets/RouteContactsItem.vue'
import RouteContactsGroup from './assets/RouteContactsGroup.vue'
import {remove_item, remove_match, remove_matches, sort} from '@/services/utils/arrays'
import {download_file} from '@/services/utils/misc'
import {sleep} from '@/services/utils/async'
import {MustReauthenticate, MustReconnect} from '@/services/utils/exceptions'
import {Group} from '@/services/database/groups'
import {OAuth} from '@/services/database/oauths'
import {Contact} from '@/services/database/contacts'
import {Task, task_manager} from '@/services/tasks/tasks'
import {taskless_contacts_create} from '@/services/tasks/contacts'


interface ContactItem {
    contact:Contact
    selected:boolean
    unread:number
    last_read:Date|null
}


@Component({
    components: {RouteContactsItem, RouteContactsGroup},
})
export default class extends Vue {

    contacts:ContactItem[] = []
    groups:Group[] = []
    oauths:OAuth[] = []

    filter_group_id = '-'  // Special value for null as empty values don't get highlighted
    search = ''
    loaded_reads = false

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
                item => this.filter_group!.contacts.includes(item.contact.id))
        } else if (this.filter_group_id === 'duplicates'){
            // Show all contacts that don't have a unique address
            const addresses:Record<string, ContactItem[]> = {}
            for (const item of this.contacts){
                const address = item.contact.address.trim().toLowerCase()
                if (address && address in addresses){
                    addresses[address]!.push(item)
                } else if (address){
                    addresses[address] = [item]
                }
            }
            return Object.values(addresses).filter(items => items.length > 1).flat()
        } else if (this.filter_group_id === 'disengaged'){
            return this.contacts.filter(item => item.unread > 1).sort((a, b) => b.unread - a.unread)
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


    // List of accounts

    get accounts(){
        // Turn oauths into "accounts" and add the groups that belong to them
        return this.oauths.map(oauth => {
            return {
                id: oauth.service_account,
                display: oauth.display,
                groups: this.groups.filter(
                    group => group.service_account === oauth.service_account),
                sync: () => this.$tm.start_contacts_sync(oauth.id),
            }
        })
    }


    // Other getters

    get something_added():boolean{
        // Whether user has added something, whether group/contact/account, i.e. not new to Stello
        return !! (this.contacts.length || this.groups.length || this.accounts.length)
    }

    get filter_group():Group|null{
        // The group being used to filter contacts
        if (this.search || this.filter_group_id === '-')
            return null
        return this.groups.find((g => g.id === this.filter_group_id)) ?? null
    }

    get some_selected():boolean{
        // Whether some contacts (not necessarily matched) have been selected or not
        return this.contacts_selected.length !== 0
    }

    get all_matched_selected():boolean{
        // Whether all MATCHED contacts have been selected (doesn't count if no contacts matched)
        return !!this.contacts_matched.length && this.contacts_matched.every(i => i.selected)
    }

    get bulk_value():boolean|null{
        // What value the bulk select checkbox should display as
        return this.all_matched_selected ? true : (this.some_selected ? null : false)
    }

    get empty_list_explanation():string{
        // Text that explains why list is empty
        if (!this.contacts.length){
            return "No contacts added yet"
        } else if (this.search.length){
            return "No matches"
        } else if (this.filter_group){
            return "Group empty"
        } else if (this.filter_group_id === 'duplicates'){
            return "No duplicates"
        } else if (this.filter_group_id === 'disengaged'){
            return "No contacts are disengaged"
        }
        return ""
    }

    get empty_list_action_label():string|null{
        // Text for button when list is empty
        if (!this.contacts.length){
            return "Import contacts"
        } else if (this.search.length){
            return "Clear search"
        } else if (this.filter_group){
            return "New contact"
        }
        return null
    }

    get default_contacts_oauth(){
        // Get the oauth record for default contacts account
        for (const oauth of this.oauths){
            if (oauth.service_account === this.$store.state.default_contacts){
                return oauth
            }
        }
        return null
    }

    // Watch

    @Watch('search') watch_search(value:string):void{
        // Search always applies to whole list and deselects any previous group selection
        if (value){
            this.filter_group_id = '-'
        }

        // Scroll back to top since list changed
        ;(this.$refs['scrollable'] as Vue)?.$el.scroll(0, 0)
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
        if (value === 'disengaged'){
            void this.load_reads()
        }

        // Scroll back to top since list changed
        ;(this.$refs['scrollable'] as Vue)?.$el.scroll(0, 0)
    }

    @Watch('$tm.data.finished') watch_tm_finished(task:Task){
        // Listen to task completions and adjust state as needed
        // TODO handle more events
        if (task.name === 'contacts_remove'){
            remove_match(this.contacts, item => item.contact.id === task.params[1])
        } else if (task.name === 'contacts_sync'){
            void this.load_contacts()
        } else if (task.name === 'contacts_group_name'){
            const group = this.groups.find(g => g.id === task.params[0])
            if (group){
                group.name = task.options[0] as string
            }
        }
    }

    // Methods

    async load_contacts():Promise<void>{
        // Load all contacts and groups from db
        const [contacts, groups, oauths] = await Promise.all([
            self.app_db.contacts.list(),
            self.app_db.groups.list(),
            self.app_db.oauths.list(),
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
                unread: 0,
                last_read: null,
            }
        })

        // Expose groups and oauths as is
        this.groups = groups
        this.oauths = oauths
    }

    async load_reads(){
        // Load reads data and calculate disengaged stats

        // Don't run more than once per mount
        if (this.loaded_reads){
            return
        }
        this.loaded_reads = true

        // Load required data
        const reads = await self.app_db.reads.list()
        const copies = await self.app_db.copies.list()
        const messages = await self.app_db.messages.list()

        // Map msg ids to published date (in ms)
        const msg_pub_ms:Record<string, number> = {}
        for (const msg of messages){
            msg_pub_ms[msg.id] = msg.published.getTime()
        }

        // Determine the date last read for every copy
        const last_read_copy:Record<string, Date> = {}
        for (const read of reads){
            const prev_ms = last_read_copy[read.copy_id]?.getTime() ?? 0
            if (prev_ms < read.sent.getTime()){
                last_read_copy[read.copy_id] = read.sent
            }
        }

        // Collect published date (in ms) of latest msg each contact has read
        const latest_read_pub:Record<string, number> = {}

        // Determine the date last read anything for contacts
        const last_read:Record<string, Date> = {}

        for (const copy of copies){
            if (copy.id in last_read_copy){

                // Update last read date for contact if this copy read more recently than any prev
                const proposed_ms = last_read_copy[copy.id]!.getTime()
                const existing_ms = last_read[copy.contact_id]?.getTime() ?? 0
                if (proposed_ms > existing_ms){
                    last_read[copy.contact_id] = last_read_copy[copy.id]!
                }

                // Also update latest msg read for contact if more recent than prev
                // NOTE The most recent read for a contact may not be the latest msg if an old msg
                const pub_ms = msg_pub_ms[copy.msg_id]!
                if (pub_ms > (latest_read_pub[copy.contact_id] ?? 0)){
                    latest_read_pub[copy.contact_id] = pub_ms
                }
            }
        }

        // Work out unread streak for each contact
        const unread_streak:Record<string, number> = {}
        for (const copy of copies){
            if (! (copy.id in last_read_copy) && copy.invited
                    && msg_pub_ms[copy.msg_id]! > (latest_read_pub[copy.contact_id] ?? 0)){
                unread_streak[copy.contact_id] = (unread_streak[copy.contact_id] ?? 0) + 1
            }
        }

        // Apply results to contacts
        for (const item of this.contacts){
            item.unread = unread_streak[item.contact.id] ?? 0
            item.last_read = last_read[item.contact.id] ?? null
        }
    }

    async new_contact():Promise<void>{
        // Create a new contact and navigate to it

        let contact:Contact
        if (!this.default_contacts_oauth){
            // Create a regular Stello contact
            contact = await self.app_db.contacts.create()
        } else {

            // Prompt the user for a name and address as can't create synced contact without them
            const input = await this.$store.dispatch('show_dialog', {
                component: DialogNewContact,
                props: {oauth: this.default_contacts_oauth},
            }) as {name:string, address:string}|undefined
            if (!input){
                return  // Dialog cancelled
            }

            // Wait for the contact to be created so can navigate to it
            void this.$store.dispatch('show_waiting', "Creating contact...")
            try {
                contact = await taskless_contacts_create(
                    this.default_contacts_oauth, input.name, input.address)
            } catch (error){
                // Failed to create for some reason
                if (error instanceof MustReconnect){
                    void this.$store.dispatch('show_snackbar', "Could not connect")
                } else if (error instanceof MustReauthenticate){
                    void this.$store.dispatch('show_snackbar', "Cannot create contact until resync")
                } else {
                    self.app_report_error(error)
                    void this.$store.dispatch('show_snackbar', "Error: Unable to create contact")
                }
                return  // Cancel creation
            } finally {
                void this.$store.dispatch('close_dialog')
            }
        }

        if (this.filter_group){
            // Auto-add contact to currently selected group if possible
            if (!this.filter_group.service_account){
                // Any contact can be added to a local Stello group
                this.filter_group.contacts.push(contact.id)
                await self.app_db.groups.set(this.filter_group)
            } else if (this.filter_group.service_account
                    === this.default_contacts_oauth?.service_account){
                // Can only add to service group if contact is in that account
                // NOTE Don't wait to finish, RouteContact will show it when it's done
                void task_manager.start_contacts_group_fill(this.default_contacts_oauth.id,
                    this.filter_group.id, [contact.id])
            }
        }

        // Navigate to the new contact
        void this.$router.push({name: 'contact', params: {contact_id: contact.id}})
    }

    async new_group():Promise<void>{
        // Create a new group
        const group = await self.app_db.groups.create()

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
            void this.show_import_dialog()
        } else if (this.search.length){
            this.search = ''
        } else if (this.filter_group){
            void this.new_contact()
        }
    }

    async show_import_dialog():Promise<void>{
        // Open dialog for importing contacts
        // NOTE Import dialog returns id of group of all the new contacts if any
        const group_id = await this.$store.dispatch('show_dialog', {
            component: DialogContactsImport,
            wide: true,
        }) as string
        if (group_id){
            // New group and contacts so just load fresh from db and display the new group
            void this.load_contacts()
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
        const ids = this.contacts_selected_internal.map(c => c.contact.id)
        void self.app_db.contacts.remove(ids)

        // Remove deleted from list
        this.contacts = this.contacts.filter(item => !ids.includes(item.contact.id))

        // Notify how many deleted/skipped
        const skipped = this.contacts_selected.length
        const skipped_text = skipped ? `(skipped ${skipped} synced contacts)` : ''
        void this.$store.dispatch('show_snackbar', `Deleted ${ids.length} contacts ${skipped_text}`)
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
        const group = await self.app_db.groups.create('', contact_ids)

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
        const group = await this.$store.dispatch('show_dialog', {
            component: DialogGroupChoice,
            props: {groups: this.groups_internal},  // WARN Cannot join external groups
        }) as Group
        if (group){
            // Add contacts to the group and remove any duplicates
            group.contacts.push(...this.contacts_selected.map(item => item.contact.id))
            group.contacts = uniq(group.contacts)
            void self.app_db.groups.set(group)
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
            void self.app_db.groups.set(this.filter_group)
            // Clear selection so user doesn't get confused
            this.clear_selected()
        }
    }

    async do_selected_new_draft():Promise<void>{
        // Create a new draft and add selected contacts as recipients
        // NOTE Does NOT use the default template if any
        const draft = await self.app_db.drafts.create_object()
        draft.recipients.include_contacts = this.contacts_selected.map(item => item.contact.id)
        await self.app_db.drafts.set(draft)
        void this.$router.push({name: 'draft', params: {draft_id: draft.id}})
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

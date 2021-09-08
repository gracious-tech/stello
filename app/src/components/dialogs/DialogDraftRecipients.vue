
<template lang='pug'>

v-card
    v-card-title Recipients ({{ final_recipients.length }})

    v-tabs(v-model='tab' color='accent' grow class='px-6')
        v-tab Groups
        v-tab Contacts

    div.filtering(v-if='tab === 1 && contacts.length')
        v-chip-group(v-model='contacts_filter' active-class='accent--text')
            v-chip All
            v-chip Recipients
            v-chip Non-Recipients
        app-text(v-model='contacts_search' placeholder='Search...' rounded dense)
            template(#append)
                    app-btn(v-if='contacts_search' @click='contacts_search = ""' icon='close')

    v-card-text(ref='scrollable')

        template(v-if='!contacts.length')
            p(class='text-center mt-10') You don't have any contacts yet
            p(class='text-center')
                app-btn(to='/contacts/') Add contacts

        v-tabs-items(v-else v-model='tab')
            v-tab-item
                v-list
                    v-list-item(:key='group_all.id' @click='group_all.click'
                            :color='group_all.color')
                        v-list-item-icon
                            app-svg(:name='group_all.icon')
                        v-list-item-content
                            v-list-item-title {{ group_all.display }}
                        v-list-item-icon(class='justify-end') {{ group_all.size }}
                    v-divider
                    v-list-item(v-for='group of groups_ui' :key='group.id' @click='group.click'
                            :color='group.color')
                        v-list-item-icon
                            app-svg(:name='group.icon')
                        v-list-item-content
                            v-list-item-title {{ group.display }}
                        v-list-item-icon(class='justify-end') {{ group.size }}

            v-tab-item.contacts
                v-list
                    v-list-item(v-for='contact of contacts_visible_ui' :key='contact.id'
                            @click='contact.click' :class='contact.classes' :data-tip='contact.tip')
                        v-list-item-icon
                            app-svg(:name='contact.icon')
                        v-list-item-content
                            v-list-item-title {{ contact.display }}
                        v-list-item-action(class='ellipsis')
                            v-list-item-action-text {{ contact.address }}
                p(v-if='is_limited || contacts_search' class='text-center')
                    app-btn(@click='reveal_more' small) {{ is_limited ? "Show more" : "Clear search" }}

    v-card-actions
        app-btn(@click='dismiss') Close

</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import {remove_item} from '@/services/utils/arrays'
import {Draft} from '@/services/database/drafts'
import {Group} from '@/services/database/groups'
import {Contact} from '@/services/database/contacts'
import {Unsubscribe} from '@/services/database/unsubscribes'


@Component({})
export default class extends Vue {

    @Prop({type: Draft, required: true}) draft:Draft
    @Prop({type: Array, required: true}) groups:Group[]
    @Prop({type: Array, required: true}) contacts:Contact[]
    @Prop({type: Array, required: true}) unsubscribes:Unsubscribe[]

    tab = 0
    contacts_filter = 0
    contacts_search = ''
    contacts_pages = 1

    get final_recipients():string[]{
        // Get list of contact ids that will currently be included when all things accounted for
        return this.draft.get_final_recipients(this.contacts, this.groups, this.unsubscribes)
    }

    get contact_ids():string[]{
        // A list of just contact ids (rather than objects)
        return this.contacts.map(c => c.id)
    }

    get unsubscribes_ids(){
        // A list of contact ids for unsubscribes, rather than objects
        return this.unsubscribes
            .filter(u => u.profile === this.draft.profile)
            .map(u => u.contact)
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
                // NOTE Don't count any contacts that have since been deleted
                size: group.contacts.filter(id => this.contact_ids.includes(id)).length,
                icon: 'icon_checkbox_' + (excluded ? 'cross' : (included ? 'true' : 'false')),
                color: excluded ? 'error' : (included ? 'accent' : ''),
                click: () => {this.toggle_group(group.id)},
            })
        }
        return items
    }

    get group_all(){
        // A special group item for including all contacts
        const all_included = this.draft.recipients.include_groups.includes('all')
        return {
            id: 'all',
            display: "All contacts",
            size: this.contacts.length,
            icon: `icon_checkbox_${all_included}`,
            color: all_included ? 'accent' : '',
            click: () => {
                // NOTE Can't exclude all, like with other groups
                if (all_included){
                    remove_item(this.draft.recipients.include_groups, 'all')
                } else {
                    this.draft.recipients.include_groups.push('all')
                }
                this.save()
            },
        }
    }

    get contacts_visible_ui(){
        // A UI view of the contacts data
        const items = []
        for (const contact of this.contacts_visible){
            // Determine if the contact is included or excluded, and why
            const included = this.draft.recipients.include_contacts.includes(contact.id)
            const excluded = this.draft.recipients.exclude_contacts.includes(contact.id)
            const unsubscribed = this.unsubscribes_ids.includes(contact.id)
            const in_final = this.final_recipients.includes(contact.id)
            // Collect classes based on inclusion status
            const classes = []
            if (included){
                classes.push('accent--text')
            } else if (excluded){
                classes.push('error--text')
            }
            if (unsubscribed){
                classes.push('unsubscribed')
            }
            if (!in_final){
                classes.push('opacity-disabled')
            }
            // Return props and methods
            items.push({
                id: contact.id,
                display: contact.display,
                address: contact.address,
                icon: 'icon_checkbox_' + (in_final ? 'true' : (excluded ? 'cross' : 'false')),
                classes,
                tip: unsubscribed ? "Unsubscribed"
                    : (in_final && !included ? "Included by group" : null),
                click: () => {this.toggle_contact(contact.id)},
            })
        }
        return items
    }

    get contacts_matched():Contact[]{
        // The contacts that should be displayed based on current filters
        if (this.contacts_search){
            // TODO Improve search method, especially for i18n
            const lower_search = this.contacts_search.toLowerCase()
            return this.contacts.filter(contact => {
                return contact.name.toLowerCase().includes(lower_search)
                    || contact.name_hello.toLowerCase().includes(lower_search)
                    || contact.address.toLowerCase().includes(lower_search)
            })
        } else if (this.contacts_filter !== 0){
            return this.contacts.filter(contact => {
                const in_final = this.final_recipients.includes(contact.id)
                return in_final === (this.contacts_filter === 1)
            })
        }
        return this.contacts
    }

    get contacts_visible():Contact[]{
        // The contacts present in the DOM, optionally limited to reduce lag
        return this.contacts_matched.slice(0, 100 * this.contacts_pages)
    }

    get is_limited():boolean{
        // Whether contacts are being limited to reduce load on the DOM
        return this.contacts_visible.length < this.contacts_matched.length
    }

    @Watch('contacts_matched') watch_contacts_matched(){
        // Whenever matched contacts changes, scroll back to top and reduce to 1 page again
        (this.$refs['scrollable'] as Element).scroll(0, 0)
        this.contacts_pages = 1
    }

    @Watch('contacts_filter') watch_contacts_filter(value:number){
        // Respond to changes in filter value
        if (value !== null){
            // Filter has been re-engaged so clear any existing search
            this.contacts_search = ''
        }
    }

    @Watch('contacts_search') watch_contacts_search(value:string){
        // Respond to changes in search value
        if (value){
            // User has started/continued searching so clear any existing filter
            this.contacts_filter = null
        } else if (this.contacts_filter === null){
            // User has cleared search and no filter yet, so default to showing all
            this.contacts_filter = 0
        }
    }

    reveal_more():void{
        // Reveal more contacts by either clearing search or increasing number of pages
        if (this.is_limited){
            this.contacts_pages *= 2  // Increase exponentially so quicker for those who want all
        } else {
            this.contacts_search = ''
        }
    }

    toggle_group(group_id){
        // A three state toggle for groups: include -> exclude -> undefined
        if (this.draft.recipients.include_groups.includes(group_id)){
            // Was included, so now exclude
            remove_item(this.draft.recipients.include_groups, group_id)
            this.draft.recipients.exclude_groups.push(group_id)
        } else if (this.draft.recipients.exclude_groups.includes(group_id)){
            // Was excluded, so now leave undefined
            remove_item(this.draft.recipients.exclude_groups, group_id)
        } else {
            // Was undefined, so now include
            this.draft.recipients.include_groups.push(group_id)
        }
        this.save()
    }

    toggle_contact(contact_id){
        // A three state toggle for contacts: include -> exclude -> undefined
        if (this.draft.recipients.include_contacts.includes(contact_id)){
            // Was included, so now exclude
            remove_item(this.draft.recipients.include_contacts, contact_id)
            this.draft.recipients.exclude_contacts.push(contact_id)
        } else if (this.draft.recipients.exclude_contacts.includes(contact_id)){
            // Was excluded, so now leave undefined
            remove_item(this.draft.recipients.exclude_contacts, contact_id)
        } else {
            // Was undefined, so now include
            this.draft.recipients.include_contacts.push(contact_id)
        }
        this.save()
    }

    save(){
        self.app_db.drafts.set(this.draft)
    }

    dismiss(){
        this.$emit('close')
    }

}

</script>


<style lang='sass' scoped>


.v-tabs
    flex-grow: 0  // For some reason need `grow` on element to grow width, but disable height here

.filtering
    display: flex
    align-items: center
    padding: 12px 24px 0 24px

    .v-chip
        margin-right: 12px

    ::v-deep
        // Fix padding of search field so it looks similar to a chip
        .v-input__slot
            margin-bottom: 0
            padding-right: 0
        .v-text-field__details
            display: none
        .v-input__append-inner
            margin-top: 0 !important
        .v-btn
            width: 40px
            height: 40px


.contacts
    .v-list-item
        &.unsubscribed .v-list-item__content
            text-decoration: line-through
        &::after
            left: 40%  // Easier to see in middle
        .v-list-item__content, .v-list-item__action
            flex-basis: 0  // So each item grows same as each other, regardless of content
        .v-list-item__content
            flex-grow: 4
        .v-list-item__action
            flex-grow: 3


</style>

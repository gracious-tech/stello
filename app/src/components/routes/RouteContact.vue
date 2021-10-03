
<template lang='pug'>

div
    v-toolbar
        app-btn(@click='back' icon='arrow_back')
        v-toolbar-title {{ contact && contact.name }}
        v-spacer
        app-btn(v-if='contact' @click='remove' icon='delete' color='error')

    app-content(v-if='!contact' class='text-center pt-10')
        h1(class='text--secondary text-h6') Contact no longer exists

    app-content(v-else class='pa-10')

        template(v-if='synced')
            p(class='text-center')
                app-svg(:name='`icon_${issuer}`' class='mx-4')
                | Synced from account {{ service_account_display }}
            p(class='text-center')
                app-btn(:href='service_url' small) Open in {{oauth.display_issuer}} Contacts

        div.names
            app-text(v-model='name' :readonly='synced' label="Full name" @click='synced_change_name')
            app-text(v-model='name_hello' :placeholder='contact.name_hello_result' label="Greet as"
                :hint='multiple ? "" : "Defaults to excluding last name"' persistent-placeholder)

        //- WARN Application logic currently depends on address being trimmed
        app-text(v-model.trim='address' :readonly='synced' @click='synced_change_email'
            label="Email address")

        app-select(v-model='groups' :items='possible_groups_items' multiple label="Groups")
            template(#append-item)
                v-divider
                app-list-item(@click='new_group' color='accent') Create new group

        app-textarea(v-model='notes' :readonly='synced' @click='synced_change_notes' label="Notes")

        app-switch(v-model='multiple' label="Messages to this contact will go to many people"
            hint="Hides unsubscribe links & always allows infinite message opens until expiry")

        app-select(v-if='!probably_new' v-model='unsubscribes_profiles' :items='profiles_ui'
            multiple select :disabled='multiple' label="Unsubscribed from")

        div.saved(:class='{changed}') Changes saved

</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import DialogGroupName from '../dialogs/reuseable/DialogGroupName.vue'
import DialogGenericText from '../dialogs/generic/DialogGenericText.vue'
import DialogGenericConfirm from '../dialogs/generic/DialogGenericConfirm.vue'
import DialogContactEmail from '../dialogs/specific/DialogContactEmail.vue'
import {partition} from '@/services/utils/strings'
import {Contact} from '@/services/database/contacts'
import {Group} from '@/services/database/groups'
import {OAuth} from '@/services/database/oauths'
import {Profile} from '@/services/database/profiles'
import {Unsubscribe} from '@/services/database/unsubscribes'
import {remove_item, remove_match, sort} from '@/services/utils/arrays'
import {Task, task_manager} from '@/services/tasks/tasks'


@Component({})
export default class extends Vue {

    @Prop() contact_id:string

    contact:Contact = null
    possible_groups:Group[] = null
    profiles:Profile[] = []
    unsubscribes:Unsubscribe[] = []
    oauth:OAuth = null
    changed = false
    probably_new = true  // Doesn't change after first load

    created(){
        // Load data from db
        void this.load_contact_related().then(() => {
            // Assess whether a new contact or not (shows unsubscribed field if not new)
            if (this.contact?.name || this.contact?.address){
                this.probably_new = false
            }
        })
        void this.load_profiles()
        void this.load_unsubscribes()
    }

    beforeDestroy(){
        this.consider_auto_delete()
    }

    get synced(){
        // Whether contact is synced with a service account
        return !!this.contact.service_account
    }

    get issuer(){
        // The code for the issuer (if synced)
        return this.synced ? partition(this.contact.service_account, ':')[0] : null
    }

    get service_account_display(){
        // User friendly label for the service account (if any)
        return this.oauth && this.oauth.display
    }

    get service_url():string|undefined{
        // URL for service's page for editing the contact
        // NOTE If different account is the first signed into, user must change to correct account
        if (this.issuer === 'google'){
            return `https://contacts.google.com/person/${this.contact.service_id}`
        }
        return undefined
    }

    get possible_groups_items(){
        // Return possible groups in format that v-select understands
        const items = this.possible_groups.map(group => {
            return {
                value: group.id,
                text: group.display,
                disabled: !!group.service_account,
            }
        })
        // Separate internal and external groups
        const final:object[] = items.filter(i => !i.disabled)
        const external = items.filter(i => i.disabled)
        if (external.length){
            final.push(
                {divider: true},
                {header: "Synced groups (not editable)"},
                ...external,
            )
        }
        return final
    }

    get profiles_ui():{value:string, text:string}[]{
        // Get profiles as array in format select component accepts
        return this.profiles.map(profile => ({value: profile.id, text: profile.display}))
    }

    // GET/SET CONTACT PROPERTIES

    get name(){
        return this.contact.name
    }
    set name(value){
        this.contact.name = value
        this.save()
    }

    get name_hello(){
        return this.contact.name_hello
    }
    set name_hello(value){
        this.contact.name_hello = value
        this.save()
    }

    get address(){
        return this.contact.address
    }
    set address(value){
        this.contact.address = value
        this.save()
    }

    get notes(){
        return this.contact.notes
    }
    set notes(value){
        this.contact.notes = value
        this.save()
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
                    remove_item(group.contacts, this.contact.id)
                }
                // Save changes
                self.app_db.groups.set(group)
            }
        }
    }

    get multiple(){
        return this.contact.multiple
    }
    set multiple(value:boolean){
        this.contact.multiple = value
        this.save()
        if (value){
            this.unsubscribes_profiles = []  // Multi-person contacts can't unsubscribe
        }
    }

    // GET/SET OTHER

    get unsubscribes_profiles():string[]{
        // List of profile ids for unsubscribes
        return this.unsubscribes.map(unsub => unsub.profile)
    }
    set unsubscribes_profiles(new_profiles:string[]){
        // Handle removal of profiles
        for (const old_id of this.unsubscribes_profiles){
            if (!new_profiles.includes(old_id)){
                self.app_db.unsubscribes.remove(old_id, this.contact_id)
                remove_match(this.unsubscribes, unsub => unsub.profile === old_id)
            }
        }
        // Handle addition of profiles
        for (const new_id of new_profiles){
            if (!this.unsubscribes_profiles.includes(new_id)){
                const record:Unsubscribe = {
                    profile: new_id,
                    contact: this.contact_id,
                    sent: new Date(),
                    ip: null,
                    user_agent: null,
                }
                self.app_db.unsubscribes.set(record)
                this.unsubscribes.push(record)
            }
        }
    }

    // WATCH

    @Watch('$tm.data.finished') watch_finished(task:Task){
        // Respond to task completions
        if (task.name.startsWith('contacts_')){
            // Any contact task completing while looking at a contact is 99% likely to be relevant
            // NOTE This is important to do when oauth fails while trying to change email address
            //      as it may have failed because the contact no longer exists
            this.load_contact_related()
        } else if (task.name === 'responses_receive'){
            // May have received a subscription response for this contact
            this.load_unsubscribes()
        }
    }

    // METHODS

    async load_contact_related():Promise<void>{
        await Promise.all([
            self.app_db.contacts.get(this.contact_id),
            self.app_db.groups.list(),
        ]).then(async ([contact, groups]) => {
            sort(groups, 'name')
            this.possible_groups = groups
            if (contact?.service_account){
                this.oauth = await self.app_db.oauths.get_by_issuer_id(
                    ...partition(contact.service_account, ':'))
            } else {
                this.oauth = null
            }
            this.contact = contact
        })
    }

    async load_profiles():Promise<void>{
        // Load profiles that could be unsubscribed from
        this.profiles = (await self.app_db.profiles.list()).filter(p => p.setup_complete)
    }

    async load_unsubscribes():Promise<void>{
        // Load unsubscribes for this contact
        this.unsubscribes = await self.app_db.unsubscribes.list_for_contact(this.contact_id)
    }

    save():void{
        // Save changed to contact
        self.app_db.contacts.set(this.contact)

        // Briefly toggle changed property to trigger animation
        this.changed = true
        setTimeout(() => {this.changed = false}, 3000)
    }

    async back():Promise<void>{
        // Go back to previous route
        // NOTE Not necessarily contacts list, as could go back to responses etc
        await this.consider_auto_delete()
        this.$router.back()
    }

    async consider_auto_delete():Promise<void>{
        // If contact has no basic info, auto delete it (mainly for leaving a newly created contact)
        // TODO May need to consider other factors
        if (this.contact && !this.synced && !this.contact.name && !this.contact.address){
            await self.app_db.contacts.remove(this.contact_id)
        }
    }

    async new_group(){
        // Create new group and add the contact to it
        const group = await self.app_db.groups.create('', [this.contact_id])
        this.possible_groups.push(group)
        this.$store.dispatch('show_dialog', {component: DialogGroupName, props: {group}})
    }

    async synced_change_name(event:Event){
        // Open dialog to change name and sync with service
        if (this.synced){
            const value = await this.$store.dispatch('show_dialog', {
                component: DialogGenericText,
                props: {
                    label: "Full name",
                    initial: this.name,
                },
            })
            if (typeof value === 'string'){  // NOTE Distinguish between empty string and undefined
                task_manager.start_contacts_change_property(
                    this.oauth.id, this.contact_id, 'name', value)
            }
        }
    }

    async synced_change_notes(event:Event){
        // Open dialog to change notes and sync with service
        if (this.synced){
            const value = await this.$store.dispatch('show_dialog', {
                component: DialogGenericText,
                props: {
                    label: "Notes",
                    initial: this.notes,
                    textarea: true,
                },
            })
            if (typeof value === 'string'){  // NOTE Distinguish between empty string and undefined
                task_manager.start_contacts_change_property(
                    this.oauth.id, this.contact_id, 'notes', value)
            }
        }
    }

    async synced_change_email(event:Event){
        // Open dialog to change email and sync with service
        if (this.synced){
            this.$store.dispatch('show_dialog', {
                component: DialogContactEmail,
                props: {
                    contact: this.contact,
                    oauth: this.oauth,
                },
            })
        }
    }

    async remove(){
        // Remove this contact
        if (this.synced){
            const issuer = this.oauth.display_issuer
            const confirmed = await this.$store.dispatch('show_dialog', {
                component: DialogGenericConfirm,
                props: {
                    title: `This will permanently delete the contact in Stello and in ${issuer}`,
                    confirm: "Delete",
                    confirm_danger: true,
                },
            })
            if (!confirmed){
                return
            }
            task_manager.start_contacts_remove(this.oauth.id, this.contact_id)
        } else {
            await self.app_db.contacts.remove(this.contact_id)
        }
        this.$router.push('../')
    }

}

</script>


<style lang='sass' scoped>


.v-input
    margin: 24px 0

.names
    display: flex

    > .v-input:nth-child(1)
        width: 66%
        margin-right: 24px

.saved
    opacity: 0
    color: var(--accent)
    font-size: 12px
    text-align: center
    transition: opacity 1s

    &.changed
        opacity: 1


</style>

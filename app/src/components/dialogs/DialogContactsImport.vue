
<template lang='pug'>

v-card
    v-card-title Import Contacts

    div.csv_controls(v-if='type === "csv" && contacts.length')
        span(class='text--secondary') Relevant columns
        app-select(v-model='csv_column_name' :items='csv_columns' label="Name column" dense
            outlined)
        app-select(v-model='csv_column_email' :items='csv_columns' label="Email column" dense
            outlined)

    v-card-text
        v-simple-table(v-if='contacts.length' dense fixed-header)
            thead
                tr
                    th
                        app-btn-checkbox(:value='toggle_all_value' :disabled='!contacts.length'
                            @click='toggle_all')
                    th Name
                    th Email Address
            tbody
                tr(v-for='contact of contacts_visible')
                    td
                        app-btn-checkbox(:value='contact.include'
                            @click='contact.include = !contact.include')
                    td(v-text='contact.name')
                    td(v-text='contact.email')
            tfoot(v-if='contacts.length > contacts_visible.length')
                tr
                    td(colspan='3' class='text-center')
                        app-btn(@click='limit_visible = false') Show all


        div(v-else class='text-center text--secondary')

            p
                app-file(@input='from_file'
                        accept='text/vcard,text/csv,text/plain,.vcf,.vcard,.txt,.csv')
                    | Load file
                app-btn(@click='from_clipboard') Paste

            p(v-if='type' class='text-subtitle-1') No contacts detected

            p.supported
                span Comma-separated (.csv)
                span vCard (.vcf)
                span Name #{'<email>'}

    v-card-actions
        app-btn(@click='dismiss') Close
        app-btn(@click='import_selected' :disabled='!some_selected')
            | {{ some_selected ? `Import ${selected.length} of ${contacts.length}` : "Import" }}

</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import vcard_json from 'vcard-json'
import neat_csv from 'neat-csv'
import email_addresses, {ParsedMailbox} from 'email-addresses'

import {get_clipboard_text} from '@/services/utils/misc'


@Component({})
export default class extends Vue {

    @Prop() done

    type = null
    csv_items:{[col:string]:string}[] = []
    csv_columns = []
    csv_column_name = null
    csv_column_email = null
    contacts:{name:string, email:string, include:boolean}[] = []
    limit_visible = true  // So don't make UI laggy if user won't check them all anyway

    get contacts_visible(){
        // The contacts present in the DOM
        return this.limit_visible ? this.contacts.slice(0, 100) : this.contacts
    }

    get selected(){
        // The contacts that have been selected
        return this.contacts.filter(c => c.include)
    }

    get all_selected(){
        // True if every possible contact selected
        return this.contacts.length === this.selected.length
    }

    get some_selected(){
        // True if at least one contact selected
        return this.selected.length > 0
    }

    get toggle_all_value(){
        // The value of the 'toggle all' checkbox
        return this.all_selected ? true : (this.some_selected ? null : false)
    }

    @Watch('csv_column_name') watch_column_name(){
        // Change which name column used for CSV
        this.apply_csv_columns()
    }

    @Watch('csv_column_email') watch_column_email(){
        // Change which email column used for CSV
        this.apply_csv_columns()
    }

    async from_file(file:File){
        // Get contact data from a file
        const extension = file.name?.split('.').pop().toLowerCase()
        const text = await file.text()
        this.parse_text(text, extension)
    }

    async from_clipboard(){
        // Get contact data from clipboard
        this.parse_text(await get_clipboard_text())
    }

    async parse_text(text:string, extension?){
        // Parse given text and auto-detect the format
        text = text.trim()
        if (text.startsWith('BEGIN:VCARD')){
            this.parse_vcard(text)
            this.type = 'vcard'
        } else if (extension === 'csv'){
            // NOTE Must set type after parsing done so don't show "no contacts" message in between
            await this.parse_csv(text)
            this.type = 'csv'
        } else {
            this.parse_addresses(text)
            this.type = 'addresses'
        }
    }

    parse_vcard(text){
        // Turn given vcard data into a list of contacts
        this.accept_contacts(vcard_json.parseVcardStringSync(text).map(contact => {
            // Get the default address, or just the first if none default
            const email = contact.email.filter(e => e.default)[0] || contact.email[0]
            return {name: contact.fullname, email: email?.value}
        }))
    }

    async parse_csv(text){
        // Turn given csv data into a list of contacts
        this.csv_items = await neat_csv(text)

        // Can't detect columns if no items
        if (!this.csv_items.length){
            this.contacts = []
            return
        }

        // Get column names from first item
        this.csv_columns = Object.keys(this.csv_items[0])

        // Auto-detect name column
        const detected_name = this.csv_columns.filter(c => c.includes('Name'))[0]
        this.csv_column_name = detected_name || this.csv_columns[0]

        // Auto-detect email column
        let detected_email = Object.entries(this.csv_items[0])
            .filter(i => i[1].includes('@'))
            .map(i => i[0])
            [0]
        if (!detected_email){
            detected_email = this.csv_columns.filter(c => c.includes('E-mail'))[0]
        }
        this.csv_column_email = detected_email || this.csv_columns[0]

        // Do initial conversion to contacts (user may change selected columns after this)
        this.apply_csv_columns()
    }

    apply_csv_columns(){
        // Reconvert CSV data to contacts based on current column selections
        this.accept_contacts(this.csv_items.map(item => {
            return {name: item[this.csv_column_name], email: item[this.csv_column_email]}
        }))
    }

    parse_addresses(text){
        // Turn given email addresses data into a list of contacts
        text = text.replaceAll('\n', ' ')
        const result = email_addresses.parseAddressList(text) || []
        this.accept_contacts(result.map((item:ParsedMailbox) => {
            return {name: item.name, email: item.address}
        }))
    }

    accept_contacts(contacts:{name:string, email:string}[]):void{
        // Take contacts from parsed input, normalise values, and accept only those with some value
        this.contacts = contacts.map(contact => {
            const name = (contact.name || '').trim()
            const email = (contact.email || '').trim()
            // Default to only selecting those with email addresses
            return {name, email, include: !!email}
        }).filter(contact => contact.name || contact.email)
    }

    toggle_all(){
        // If all contacts included, exclude all, else if none or some, include all
        const value_for_all = this.all_selected ? false : true
        this.contacts.forEach(contact => {
            contact.include = value_for_all
        })
    }

    async import_selected(){
        // Import the selected contacts and place them all in a new group

        // Create all contacts and collect their data
        const contacts = await Promise.all(this.selected.map(contact => {
            return self._db.contacts.create(contact.name, contact.email)
        }))

        // Create a new group for all the contacts
        const date = new Date()
        const group_name = `Imported ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`
        await self._db.groups.create(group_name, contacts.map(c => c.id))
        this.$store.dispatch('show_snackbar', `Successfully imported ${contacts.length} contacts`)

        // Let current route know have finished importing
        this.done()
        this.dismiss()
    }

    dismiss(){
        // Close the dialog
        this.$store.dispatch('show_dialog', null)
    }

}

</script>


<style lang='sass' scoped>

.csv_controls
    display: flex
    margin: 12px 0
    padding: 0 24px
    justify-content: space-between
    align-items: center
    font-weight: 500

    .v-select
        max-width: 175px

        ::v-deep .v-text-field__details
            display: none

.supported span
    display: inline-block
    margin: 6px
    @include themed(background-color, #0003, #fff3)
    border-radius: 12px
    padding: 0 12px
    font-size: 14px
    white-space: nowrap
    user-select: none

::v-deep
    // Make table contents scrollable
    .v-data-table, .v-data-table__wrapper
        height: 100%

</style>

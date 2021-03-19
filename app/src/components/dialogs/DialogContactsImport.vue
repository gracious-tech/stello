
<template lang='pug'>

v-card
    v-card-title Import Contacts

    div.csv_controls(v-if='type === "csv" && contacts.length')
        p.warn(class='text-center') Confirm columns are correct
        div.columns
            app-select(v-model='csv_column_name' :items='csv_columns' label="Name column"
                dense outlined)
            app-select(v-model='csv_column_name2' :items='csv_columns_optional'
                label="Last Name (if needed)" dense outlined)
            app-select(v-model='csv_column_email' :items='csv_columns' label="Email column"
                dense outlined)

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
                app-btn(@click='oauth_google' raised color='' class='mr-3')
                    app-svg(name='icon_google' class='mr-3')
                    | Google

            p
                app-btn(@click='oauth_microsoft' raised color='' class='mr-3')
                    app-svg(name='icon_microsoft' class='mr-3')
                    | Outlook

            v-divider

            p
                app-file(@input='from_file'
                    accept='text/*,application/zip,.vcf,.vcard,.csv,.eml,.zip') From file

            p(v-if='type' class='text-subtitle-1') No contacts detected

            p.supported
                span Comma-separated (.csv)
                span vCard (.vcf)
                span Email (.eml)

    v-card-actions
        app-btn(@click='dismiss') Close
        app-btn(@click='import_selected' :disabled='!some_selected')
            | {{ some_selected ? `Import ${selected.length} of ${contacts.length}` : "Import" }}

</template>


<script lang='ts'>

import papaparse from 'papaparse'
import vcard_json from 'vcard-json'
import PostalMime from 'postal-mime'
import * as zip from '@zip.js/zip.js/dist/zip'
import {Component, Vue, Watch} from 'vue-property-decorator'

import {oauth_action_init_grant} from '@/services/oauth'


@Component({})
export default class extends Vue {

    type = null
    csv_items:{[col:string]:string}[] = []
    csv_columns = []
    csv_column_name = null
    csv_column_name2 = null
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

    get csv_columns_optional(){
        // Get CSV columns with a null option at the start
        return [{value: null, text: "—"}, ...this.csv_columns]
    }

    @Watch('csv_column_name') watch_column_name(){
        // Change which name column used for CSV
        this.apply_csv_columns()
    }

    @Watch('csv_column_name2') watch_column_name2(){
        // Change which second name column used for CSV
        this.apply_csv_columns()
    }

    @Watch('csv_column_email') watch_column_email(){
        // Change which email column used for CSV
        this.apply_csv_columns()
    }

    oauth_google(){
        oauth_action_init_grant('google', 'contacts_read')
    }

    oauth_microsoft(){
        oauth_action_init_grant('microsoft', 'contacts_read')
    }

    async from_file(file:File){
        // Get contact data from a file
        const get_ext = (filename:string):string => filename.split('.').pop().toLowerCase()
        let extension:string = get_ext(file.name)
        let text:string

        // If a zip file is given, assume it contains a single contacts file and use it instead
        // NOTE MailChimp exports a csv within a zip
        if (extension === 'zip'){
            const zip_entries = await new zip.ZipReader(new zip.BlobReader(file)).getEntries()
            if (!zip_entries.length){
                return
            }
            extension = get_ext(zip_entries[0].filename)
            text = await zip_entries[0].getData(new zip.TextWriter()) as string
        } else {
            text = await file.text()
        }

        // Parse the file's text
        if (text.trim().startsWith('BEGIN:VCARD')){
            this.parse_vcard(text)
            this.type = 'vcard'
        } else if (extension === 'csv'){
            // NOTE Must set type after parsing done so don't show "no contacts" message in between
            await this.parse_csv(text)
            this.type = 'csv'
        } else {
            this.parse_email(text)
            this.type = 'email'
        }
    }

    parse_vcard(text){
        // Turn given vcard data into a list of contacts
        this.accept_contacts(vcard_json.parseVcardStringSync(text).map(contact => {
            // Get the default address, or just the first if none default
            const email = contact.email.find(e => e.default) || contact.email[0]
            return {name: contact.fullname, email: email?.value}
        }))
    }

    async parse_csv(text){
        // Turn given csv data into a list of contacts
        this.csv_items = (await papaparse.parse(text, {header: true})).data

        // Can't detect columns if no items
        if (!this.csv_items.length){
            this.contacts = []
            return
        }

        // Get column names from first item
        this.csv_columns = Object.keys(this.csv_items[0])

        // Auto-detect name columns
        this.csv_column_name = this.csv_columns.find(c => /^(full )?name$/i.test(c))
        if (!this.csv_column_name){
            this.csv_column_name = this.csv_columns.find(c => /(first|given) name/i.test(c))
                ?? this.csv_columns[0]
            this.csv_column_name2 = this.csv_columns.find(c => /(last|family) name/i.test(c))
                ?? null
        }

        // Auto-detect email column by going through rows and columns until an '@' found
        // NOTE First rows might not have an email address, so searches multiple rows
        // NOTE Favour search for '@' as column names can be "Email Type [home/work]" etc
        for (const row of this.csv_items){
            this.csv_column_email = Object.entries(row).find(([k, v]) => v.includes('@'))?.[0]
            if (this.csv_column_email)
                break
        }
        if (!this.csv_column_email)
            this.csv_column_email = this.csv_columns[0]

        // Do initial conversion to contacts (user may change selected columns after this)
        this.apply_csv_columns()
    }

    apply_csv_columns(){
        // Reconvert CSV data to contacts based on current column selections
        this.accept_contacts(this.csv_items.map(item => {
            let name = item[this.csv_column_name]
            if (this.csv_column_name2){
                name += ' ' + item[this.csv_column_name2]
            }
            return {name, email: item[this.csv_column_email]}
        }))
    }

    async parse_email(text){
        // Extract contacts from to/cc/bcc headers of given email
        const email = await new PostalMime().parse(text)
        const recipients = [...email.to ?? [], ...email.cc ?? [], ...email.bcc ?? []]
        // Unlike other parsers, should not here accept addressless items
        // NOTE `undisclosed-recipients:;` is a "group" with no address
        this.accept_contacts(recipients.filter(item => 'address' in item).map(item => {
            return {name: item.name ?? '', email: item.address}
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
        const group = await self._db.groups.create(group_name, contacts.map(c => c.id))

        // Let caller know the id of the new group
        this.$emit('close', group.id)
    }

    dismiss(){
        // Close the dialog
        this.$emit('close')
    }

}

</script>


<style lang='sass' scoped>

.csv_controls
    margin: 12px 0
    padding: 0 24px
    font-weight: 500

    .warn
        @include themed(color, #937100, #ffc400)

    .columns
        display: flex
        justify-content: space-between
        align-items: center

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

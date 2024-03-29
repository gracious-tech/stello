
<template lang='pug'>

v-card

    v-dialog(:value='progress' persistent)
        dialog-generic-wait(title="Importing contacts...")

    v-card-title Import Contacts

    div.csv_controls(v-if='type === "csv" && contacts.length')
        p(class='text-center warning--text') Confirm columns are correct
        div.columns
            app-select(v-model='csv_column_name' :items='csv_columns_optional' label="Name column"
                dense outlined)
            app-select(v-model='csv_column_name2' :items='csv_columns_optional'
                label="Last name (if needed)" dense outlined)
            app-select(v-model='csv_column_email' :items='csv_columns' label="Email column"
                dense outlined)

    v-list.header(v-if='contacts.length')
        v-list-item
            v-list-item-action
                app-btn-checkbox(:value='toggle_all_value' :disabled='!contacts.length'
                    @click='toggle_all')
            v-list-item-content
                v-list-item-title(class='text--secondary') Full name
            v-list-item-content
                v-list-item-title(class='text--secondary') Email Address

    v-card-text

        app-content-list(v-if='contacts.length' :items='contacts' height='48')
            template(#default='{item, height_styles}')
                v-list-item(:key='item.id' :style='height_styles')
                    v-list-item-action
                        app-btn-checkbox(:value='item.include'
                            @click='item.include = !item.include')
                    v-list-item-content
                        v-list-item-title {{ item.name }}
                    v-list-item-content
                        v-list-item-title {{ item.email }}


        div(v-else-if='source === "mailchimp"')
            video(src='@/assets/guides/mailchimp_export_contacts.webm' autoplay loop controls)

            h2(class='mt-6 mb-3 text-h6') Adding contacts from Mailchimp
            ol(class='ml-4 text-body-1')
                li
                    app-btn(href='https://admin.mailchimp.com/lists/members' small)
                        | Go to contacts page
                li(class='pl-4') Click "Export Audience"
                li(class='pl-4') Click "Export As CSV" on the export you just created
                li
                    app-file(@input='from_file' :accept='file_accept') Load zip file


        div(v-else-if='source === "email"')
            img(src='@/assets/guides/gmail_save_email.png')
            p(class='mt-4 text-body-1')
                | If you have been sending newsletters as regular emails with a long list of
                |  addresses in the TO/CC/BCC fields, Stello can automatically import those contacts
                |  for you. You simply need to save a copy of the last email you sent and load it
                |  into Stello.
            p(class='text-center')
                app-file(@input='from_file' :accept='file_accept') Load email file


        div(v-else-if='source === "other"')
            p(class='text-body-1')
                | Open your contacts list and export them as a CSV or vCard file,
                |  then load it into Stello.
            p(class='text-center')
                app-file(@input='from_file' :accept='file_accept') Load file
            p.supported(class='text-center')
                span Comma-separated (.csv)
                span vCard (.vcf)


        div.sources(v-else class='text-center text--secondary')

            h1(class='text-h5') From an existing newsletter system...

            p
                app-btn(@click='source = "mailchimp"' raised color='#ffe01b' light)
                    app-svg(name='icon_mailchimp' :fill='false' class='mr-3')
                    | Mailchimp
                app-btn(@click='source = "email"' raised color='accent') Regular email
                app-btn(@click='source = "other"' raised color='primary') Other

            h1(class='text-h5') From a contacts list...

            p
                app-btn(@click='oauth_google' raised color='' light)
                    app-svg(name='icon_google' class='mr-3')
                    | Google
                //- app-btn(@click='oauth_microsoft' raised color='' light)
                //-     app-svg(name='icon_microsoft' class='mr-3')
                //-     | Outlook
                app-btn(@click='source = "other"' raised color='primary') Other


        p(v-if='type && !contacts.length' class='text-subtitle-1 text-center error--text')
            | No contacts detected

    v-card-actions
        app-btn(@click='dismiss') Close
        app-btn(@click='import_selected' :disabled='!some_selected')
            | {{ some_selected ? `Import ${selected.length} of ${contacts.length}` : "Import" }}

</template>


<script lang='ts'>

import papaparse from 'papaparse'
import PostalMime from 'postal-mime'
import {Component, Vue, Watch} from 'vue-property-decorator'

import DialogGenericWait from '@/components/dialogs/generic/DialogGenericWait.vue'
import {zip} from '@/services/misc/zip'
import {drop} from '@/services/utils/exceptions'
import {oauth_pretask_new_usage} from '@/services/tasks/oauth'
import {extract_contacts_from_vcard} from '@/services/misc/vcard'


@Component({
    components: {DialogGenericWait},
})
export default class extends Vue {

    readonly file_accept = 'text/*,application/zip,.vcf,.vcard,.csv,.eml,.zip'

    source:'mailchimp'|'email'|'other'|null = null
    type:'vcard'|'csv'|'email'|null = null  // The detected file type of the latest upload attempt
    csv_items:Record<string, string>[] = []
    csv_columns:string[] = []
    csv_column_name:string|null = null
    csv_column_name2:string|null = null
    csv_column_email:string|null = null
    contacts:{id:string, name:string, email:string, notes:string, include:boolean}[] = []
    progress = false

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
        this.dismiss()
        void oauth_pretask_new_usage('contacts_oauth_setup', [], 'google')
    }

    oauth_microsoft(){
        this.dismiss()
        void oauth_pretask_new_usage('contacts_oauth_setup', [], 'microsoft')
    }

    async from_file(file:File){
        // Get contact data from a file

        // Reset file type (so there's a visible change)
        this.type = null

        // Helper for getting normalised file extension
        const get_ext =
            (filename:string):string|undefined => filename.split('.').pop()?.toLowerCase()

        // Init vars
        let extension:string|undefined = get_ext(file.name)
        let text:string

        // If a zip file is given, assume it contains a single contacts file and use it instead
        // NOTE MailChimp exports a csv within a zip
        if (extension === 'zip'){
            const zip_entries = await new zip.ZipReader(new zip.BlobReader(file)).getEntries()
            if (!zip_entries.length){
                return
            }
            extension = get_ext(zip_entries[0]!.filename)
            text = await zip_entries[0]!.getData!(new zip.TextWriter()) as string
        } else {
            text = await file.text()
        }

        // Detect the file's type
        // NOTE Must set type after parsing done so don't show "no contacts" message in between
        if (text.trim().startsWith('BEGIN:VCARD')){
            await drop(this.parse_vcard(text))
            this.type = 'vcard'
        } else if (extension === 'csv'){
            await drop(this.parse_csv(text))
            this.type = 'csv'
        } else {
            await drop(this.parse_email(text))
            this.type = 'email'
        }
    }

    async parse_vcard(text:string):Promise<void>{
        // Turn given vcard data into a list of contacts
        this.accept_contacts(extract_contacts_from_vcard(text))
    }

    async parse_csv(text:string):Promise<void>{
        // Turn given csv data into a list of contacts

        // Parse the CSV
        const parsed = papaparse.parse<Record<string, unknown>>(text, {header: true}).data

        // Force all values to be strings
        // WARN papaparse should have dynamicTyping off by default, but bug was occuring somewhere
        this.csv_items = parsed.map(obj => Object.fromEntries(
            Object.entries(obj).map(([k, v]) => [String(k), String(v)])))

        // Can't detect columns if no items
        if (!this.csv_items.length){
            this.contacts = []
            return
        }

        // Get column names from first item
        this.csv_columns = Object.keys(this.csv_items[0]!)

        // Auto-detect name columns
        this.csv_column_name = this.csv_columns.find(c => /^(full )?name$/i.test(c)) ?? null
        if (!this.csv_column_name){
            this.csv_column_name = this.csv_columns.find(c => /(first|given) name/i.test(c))
                ?? this.csv_columns[0]!
            this.csv_column_name2 = this.csv_columns.find(c => /(last|family) name/i.test(c))
                ?? null
        }

        // Auto-detect email column by going through rows and columns until an '@' found
        // NOTE First rows might not have an email address, so searches multiple rows
        // NOTE Favour search for '@' as column names can be "Email Type [home/work]" etc
        for (const row of this.csv_items){
            this.csv_column_email =
                Object.entries(row).find(([k, v]) => v.includes('@'))?.[0] ?? null
            if (this.csv_column_email)
                break
        }
        if (!this.csv_column_email)
            this.csv_column_email = this.csv_columns[0]!

        // Better to not have a name than to set it as the same as the email address
        if (this.csv_column_name === this.csv_column_email){
            this.csv_column_name = null
        }
        if (this.csv_column_name2 === this.csv_column_email){
            this.csv_column_name2 = null
        }

        // Do initial conversion to contacts (user may change selected columns after this)
        this.apply_csv_columns()
    }

    apply_csv_columns():void{
        // Reconvert CSV data to contacts based on current column selections

        // Auto-detect a notes column if any (not done previously as not needed for UI)
        const notes_col = this.csv_columns.find(c => /^notes?$/i.test(c))

        this.accept_contacts(this.csv_items.map(item => {
            let name = item[this.csv_column_name!] ?? ''
            if (this.csv_column_name2){
                name += ' ' + (item[this.csv_column_name2] ?? '')
            }

            // Mailchimp appends timestamp to each note and joins as one line, so separate with \n
            let notes = notes_col ? (item[notes_col] ?? '') : ''
            notes = notes.replace(/\[\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d\] /g, '\n\n$&\n').trim()

            return {
                name,
                email: item[this.csv_column_email!] ?? '',
                notes,
            }
        }))
    }

    async parse_email(text:string):Promise<void>{
        // Extract contacts from to/cc/bcc headers of given email
        const email = await new PostalMime().parse(text)
        const recipients = [...email.to ?? [], ...email.cc ?? [], ...email.bcc ?? []]
        // Unlike other parsers, should not here accept addressless items
        // NOTE `undisclosed-recipients:;` is a "group" with no address
        this.accept_contacts(recipients.filter(item => 'address' in item).map(item => {
            return {name: item.name ?? '', email: item.address, notes: ''}
        }))
    }

    accept_contacts(contacts:{name:string|null, email:string|null, notes:string|null}[]):void{
        // Take contacts from parsed input, normalise values, and accept only those with some value

        // Process input by cleaning and generating id
        const processed = contacts.map(contact => {
            const name = (contact.name || '').trim()
            const email = (contact.email || '').trim()
            const notes = (contact.notes || '').trim()
            // Ensure contacts unique by email (and if no email then by name)
            const id = email || name
            // Default to only selecting those with email addresses
            return {id, name, email, notes, include: !!email}
        })

        // Only accept unique contacts and exclude empty
        this.contacts = processed.filter((contact, i) => {
            // Accept if current item is first with its id
            return contact.id && processed.findIndex(c => c.id === contact.id) === i
        })
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
        this.progress = true

        // Create all contacts and collect their data
        const contacts = await self.app_db.contacts.create(this.selected.map(contact => {
            return {
                name: contact.name,
                address: contact.email,
                notes: contact.notes,
            }
        }))

        // Create a new group for all the contacts
        const date = new Date()
        const group_name = `Imported ${date.toLocaleString()}`
        const group = await self.app_db.groups.create(group_name, contacts.map(c => c.id))

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

@import 'src/styles/utils.sass'

.v-card__title
    padding-bottom: 0 !important

.header, .csv_controls, .v-card__text
    // Ensure all have same padding so align correctly
    padding: 0 24px

.header
    font-weight: bold
    border-bottom: 1px solid hsla(0, 0%, 50%, 0.5)

.csv_controls
    font-weight: 500

    .columns
        display: flex
        justify-content: space-between
        align-items: center

        .v-select
            max-width: 175px

            &:nth-child(2)
                margin: 0 12px

            ::v-deep .v-text-field__details
                display: none

.sources

    h1
        margin: 24px 0

    .v-btn
        text-transform: none
        margin: 0 12px

        svg
            width: 20px
            height: 20px

video, img
    width: 100%

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

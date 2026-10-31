
// Contacts list, groups, bulk actions, individual contact page and importing

import {test, expect, app_eval, menu_action, select_field, wait_for_app} from './fixtures'

import type {Page} from '@playwright/test'
import type {AppFixture} from './fixtures'


// Files used for importing
const VCARD = [
    'BEGIN:VCARD', 'VERSION:3.0', 'FN:Vera Card', 'EMAIL:vera@example.com', 'END:VCARD',
    'BEGIN:VCARD', 'VERSION:3.0', 'FN:Vic Card', 'EMAIL:vic@example.com', 'END:VCARD',
].join('\r\n')
const CSV = 'First,Last,Email\nCas,Vee,cas@example.com\nCal,Vin,cal@example.com\n'
const EML = [
    'From: Me <me@example.com>',
    'To: Ema One <ema1@example.com>, ema2@example.com',
    'Bcc: Ema Three <ema3@example.com>',
    'Subject: Newsletter',
    'Content-Type: text/plain',
    '',
    'Hello',
].join('\r\n')


function contact_row(page:Page, name:string){
    // Locate a contact in the list
    return page.locator('.contacts .v-list-item', {hasText: name}).first()
}


async function dialog_text(page:Page, value:string):Promise<void>{
    // Fill in and submit a generic text dialog
    const dialog = page.locator('.v-dialog--active')
    await dialog.locator('input, textarea').first().fill(value)
    await dialog.getByRole('button', {name: "Done"}).click()
    await expect(dialog).toHaveCount(0)
}


async function contact_count(page:Page):Promise<number>{
    // Number of contacts in db
    return app_eval(page, 'return (await self.app_db.contacts.list()).length')
}


test.describe('contacts list', () => {

    test('search and group filtering', async ({page, app}) => {
        // Seeded contacts and groups show and can be filtered
        await app.open({path: '/contacts/'})
        await expect(contact_row(page, "Adam Andrews")).toBeVisible()
        await page.locator('.groups input').first().fill("ben")
        await expect(page.getByText("1 matched")).toBeVisible()
        await page.locator('.groups .search button').click()

        // Group filter shows only members
        await page.locator('.groups .v-list-item', {hasText: "Family"}).click()
        await expect(page.getByText("2 included")).toBeVisible()
        await expect(contact_row(page, "David Driver")).toBeVisible()

        // Management filters
        await page.locator('.groups .v-list-item', {hasText: "No group"}).click()
        await expect(contact_row(page, "Fred Fudge")).toBeVisible()
        await page.locator('.groups .v-list-item', {hasText: "Duplicates"}).click()
        await expect(page.locator('.contacts')).toContainText(/duplicate/i)
        await page.locator('.groups .v-list-item', {hasText: "Disengaged"}).click()
        await expect(page.getByText("Contacts who were sent messages")).toBeVisible()
        await page.locator('.groups .v-list-item', {hasText: "All contacts"}).click()
    })

    test('new contact via fab and menu', async ({page, app}) => {
        // Fab creates a blank contact and opens it
        await app.open({path: '/contacts/'})
        const before = await contact_count(page)
        await page.locator('.navbar .v-btn--fab').click()
        await expect(page).toHaveURL(/#\/contacts\/[^/]+\/$/)
        await page.getByLabel("Full name").fill("Newbie Person")
        await page.getByLabel("Email address").fill("newbie@example.com")
        await expect(page.locator('.saved.changed')).toBeVisible()
        await page.locator('.v-toolbar button').first().click()
        await expect(contact_row(page, "Newbie Person")).toBeVisible()

        // Menu option for Stello also creates a contact
        await menu_action(page, '.navbar', "Stello")
        await expect(page).toHaveURL(/#\/contacts\/[^/]+\/$/)
        await page.locator('.v-toolbar button').first().click()
        expect(await contact_count(page)).toBeGreaterThan(before)
    })

    test('groups can be created, renamed and deleted', async ({page, app}) => {
        // Group management from sidebar list
        await app.open({path: '/contacts/'})
        await page.locator('.groups').getByRole('button', {name: "New group"}).first().click()
        await dialog_text(page, "Brand New")
        const group = page.locator('.groups .v-list-item', {hasText: "Brand New"})
        await expect(group).toBeVisible()
        await menu_action(page, group, "Rename")
        await dialog_text(page, "Renamed Group")
        await expect(page.locator('.groups .v-list-item', {hasText: "Renamed Group"}))
            .toBeVisible()
        await menu_action(page, page.locator('.groups .v-list-item', {hasText: "Renamed Group"}),
            "Delete")
        const confirm = page.locator('.v-dialog--active')
        if (await confirm.count()){
            await confirm.getByRole('button').last().click()
        }
        await expect(page.locator('.groups .v-list-item', {hasText: "Renamed Group"}))
            .toHaveCount(0)
    })

    test('bulk actions on selected contacts', async ({page, app}) => {
        // Select some contacts and use each bulk action
        await app.open({path: '/contacts/'})
        const select = async (name:string) => {
            // NOTE Virtual list rows are continually repositioned so never "stable"
            await contact_row(page, name).locator('.v-list-item__action').first()
                .locator('button').click({force: true})
        }
        await select("Adam Andrews")
        await select("Ben Beaver")
        await expect(page.getByText(/2 of \d+ selected/)).toBeVisible()
        const fresh = async () => {
            // Reload page to clear any selections
            await page.reload()
            await wait_for_app(page)
        }

        // Create new group from selection
        await menu_action(page, '.navbar', "Create new group")
        await dialog_text(page, "Selected Group")
        await expect(page.locator('.groups .v-list-item', {hasText: "Selected Group"}))
            .toBeVisible()

        // Add to an existing group
        await select("Adam Andrews")
        await menu_action(page, '.navbar', "Add to a group")
        await page.locator('.v-dialog--active .v-list-item', {hasText: "Family"}).click()

        // Remove from group while filtering by it
        await page.locator('.groups .v-list-item', {hasText: "Family"}).click()
        await select("Adam Andrews")
        await menu_action(page, '.navbar', 'Remove from "Family"')
        await expect(contact_row(page, "Adam Andrews")).toHaveCount(0)
        await page.locator('.groups .v-list-item', {hasText: "All contacts"}).click()

        // Bulk toggle selects all then none
        await fresh()
        await select("Ben Beaver")
        await page.locator('.navbar .v-btn').first().click()
        await page.locator('.navbar .v-btn').first().click()

        // Export selected
        await fresh()
        await select("Ben Beaver")
        const download = page.waitForEvent('download')
        await menu_action(page, '.navbar', "Export selected")
        expect((await download).suggestedFilename()).toMatch(/\.(csv|vcf|zip)$/)

        // New message to selected
        await fresh()
        await select("Ben Beaver")
        await menu_action(page, '.navbar', "New message")
        await expect(page).toHaveURL(/#\/drafts\/[^/]+\/$/)
        await app.goto('/contacts/')

        // Delete selected
        const before = await contact_count(page)
        await select("Charlie Chapman")
        await menu_action(page, '.navbar', "Delete selected")
        const confirm = page.locator('.v-dialog--active')
        if (await confirm.count()){
            await confirm.getByRole('button').last().click()
        }
        await expect.poll(() => contact_count(page)).toBe(before - 1)
    })

    test('duplicates can be merged', async ({page, app}) => {
        // Create a duplicate address then merge
        await app.open({path: '/contacts/'})
        await app_eval(page, `
            await self.app_db.contacts.create({name: 'Adam Again', address: 'contact0@example.com'})
        `)
        await page.reload()
        await wait_for_app(page)
        await page.locator('.groups .v-list-item', {hasText: "Duplicates"}).click()
        await expect(contact_row(page, "Adam Again")).toBeVisible()
        await page.getByRole('button', {name: "Merge duplicates"}).click()
        const confirm = page.locator('.v-dialog--active')
        if (await confirm.count()){
            await confirm.getByRole('button').last().click()
        }
        await expect.poll(() => app_eval<number>(page, `return (await self.app_db.contacts.list())
            .filter(c => c.address === 'contact0@example.com').length`)).toBe(1)
    })

    test('empty contacts shows import action', async ({page, app}) => {
        // No contacts at all
        await app.open({seed: 'profile', path: '/contacts/'})
        await expect(page.locator('.contacts p.text-h5')).toBeVisible()
        await page.locator('.contacts').getByRole('button').first().click()
        await expect(page.locator('.v-dialog--active')).toBeVisible()
    })
})


test.describe('contact page', () => {

    test('edits fields, groups, unsubscribes and deletes', async ({page, app}) => {
        // Edit every field of a contact
        const seeded = await app.open()
        await app.goto(`/contacts/${seeded!.contacts[0]}/`)
        await expect(page.locator('.v-toolbar__title')).toHaveText("Adam Andrews")
        await page.getByLabel("Full name").fill("Adam Edited")
        await page.getByLabel("Greet as").fill("Ads")
        await page.getByLabel("Email address").fill("not an email")
        await expect(page.locator('.error--text').first()).toBeVisible()
        await page.getByLabel("Email address").fill("adam@example.com")
        await page.getByLabel("Notes").fill("New notes")

        // Groups select including creating a new group
        await select_field(page, "Groups").click()
        await page.locator('.menuable__content__active .v-list-item', {hasText: "Family"}).click()
        await page.locator('.menuable__content__active').getByText("Create new group").click()
        await dialog_text(page, "From Contact")
        await page.keyboard.press('Escape')

        // Mailing list switch and unsubscribe
        await page.getByText("This is a mailing list").click()
        await page.getByText("This is a mailing list").click()
        await select_field(page, "Unsubscribed from").click()
        await page.locator('.menuable__content__active .v-list-item').first().click()
        await page.keyboard.press('Escape')
        await expect(page.locator('.saved.changed')).toBeVisible()

        // Changes persisted
        const contact = await app_eval<{name:string, address:string, notes:string}>(page,
            `return self.app_db.contacts.get(${JSON.stringify(seeded!.contacts[0])})`)
        expect(contact).toMatchObject({name: "Adam Edited", address: 'adam@example.com',
            notes: "New notes"})

        // Delete contact
        await page.locator('.v-toolbar .error--text, .v-toolbar button.error--text').last().click()
        const confirm = page.locator('.v-dialog--active')
        if (await confirm.count()){
            await confirm.getByRole('button').last().click()
        }
        await expect(page).toHaveURL(/#\/contacts\/$/)
    })

    test('missing contact shows message', async ({page, app}) => {
        // Unknown contact id
        await app.open({seed: 'profile', path: '/contacts/missing/'})
        await expect(page.getByText("Contact no longer exists")).toBeVisible()
    })
})


test.describe('importing', () => {

    async function open_import(page:Page, app:AppFixture){
        // Open import dialog from contacts page
        await app.open({path: '/contacts/'})
        await page.getByRole('button', {name: "Import contacts"}).click()
        return page.locator('.v-dialog--active')
    }

    test('imports vCard file', async ({page, app}) => {
        // Other > load a vcf file
        const dialog = await open_import(page, app)
        await dialog.getByRole('button', {name: "Other"}).first().click()
        await dialog.locator('input[type=file]').setInputFiles({name: 'contacts.vcf',
            mimeType: 'text/vcard', buffer: Buffer.from(VCARD)})
        await expect(dialog.getByText("Vera Card")).toBeVisible()
        await dialog.getByRole('button', {name: /Import 2 of 2/}).click()
        await expect(dialog).toHaveCount(0, {timeout: 30 * 1000})
        await expect(contact_row(page, "Vera Card")).toBeVisible()
    })

    test('imports CSV with column selection and deselection', async ({page, app}) => {
        // CSV requires confirming columns
        const dialog = await open_import(page, app)
        await dialog.getByRole('button', {name: "Other"}).first().click()
        await dialog.locator('input[type=file]').setInputFiles({name: 'contacts.csv',
            mimeType: 'text/csv', buffer: Buffer.from(CSV)})
        await expect(dialog.getByText("Confirm columns are correct")).toBeVisible()
        await select_field(page, "Last name (if needed)").click()
        await page.locator('.menuable__content__active .v-list-item', {hasText: "Last"}).click()
        await expect(dialog.getByText("Cas Vee")).toBeVisible()

        // Toggle all off and on then deselect one
        await dialog.locator('.header button').click()
        await expect(dialog.getByRole('button', {name: "Import", exact: true})).toBeDisabled()
        await dialog.locator('.header button').click()
        await dialog.locator('.v-list-item', {hasText: "Cal Vin"}).locator('button').click()
        await dialog.getByRole('button', {name: /Import 1 of 2/}).click()
        await expect(dialog).toHaveCount(0, {timeout: 30 * 1000})
        await expect(contact_row(page, "Cas Vee")).toBeVisible()
        await expect(contact_row(page, "Cal Vin")).toHaveCount(0)
    })

    test('imports addresses from a saved email', async ({page, app}) => {
        // Regular email > load eml file
        const dialog = await open_import(page, app)
        await dialog.getByRole('button', {name: "Regular email"}).click()
        await dialog.locator('input[type=file]').setInputFiles({name: 'sent.eml',
            mimeType: 'message/rfc822', buffer: Buffer.from(EML)})
        await expect(dialog.getByText('ema2@example.com')).toBeVisible()
        await dialog.getByRole('button', {name: /Import \d of \d/}).click()
        await expect(dialog).toHaveCount(0, {timeout: 30 * 1000})
        await expect(contact_row(page, "Ema Three")).toBeVisible()
    })

    test('mailchimp guide and invalid files', async ({page, app}) => {
        // Mailchimp source shows guide; unsupported content finds no contacts
        const dialog = await open_import(page, app)
        await dialog.getByRole('button', {name: "Mailchimp"}).click()
        await expect(dialog.getByText("Adding contacts from Mailchimp")).toBeVisible()
        await dialog.locator('input[type=file]').setInputFiles({name: 'export.csv',
            mimeType: 'text/csv', buffer: Buffer.from('nothing useful')})
        await expect(dialog.getByText("No contacts detected")).toBeVisible()
        await dialog.getByRole('button', {name: "Close"}).click()
    })
})

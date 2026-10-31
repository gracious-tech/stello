
// Contacts synced from a Google account (network to Google is blocked so only UI is exercised)

import {test, expect, app_eval} from './fixtures'

import type {Page} from '@playwright/test'


async function seed_synced(page:Page):Promise<{contact:string, group:string}>{
    // Create a Google oauth with a synced contact and group
    return app_eval(page, `
        const oauth = await self.app_db.oauths.create({issuer: 'google', issuer_id: 'gid',
            issuer_config: {}, email: 'sync@gmail.com', name: 'Sync User',
            scope_sets: ['contacts'], token_refresh: new ArrayBuffer(0),
            token_access: new ArrayBuffer(0), token_access_expires: null, contacts_sync: true,
            contacts_sync_last: new Date(), contacts_sync_token: 'token'})
        const contact = await self.app_db.contacts.create({name: 'Synced Person',
            address: 'synced@example.com', service_account: 'google:gid',
            service_id: 'people/c1', notes: 'Synced notes'})
        const group = await self.app_db.groups.create('Synced Group', [contact.id],
            'google:gid', 'contactGroups/g1')
        return {contact: contact.id, group: group.id}
    `)
}


test('synced account shows in contacts with its groups', async ({page, app}) => {
    // Account section lists its groups and allows new synced groups/contacts
    await app.open({path: '/contacts/'})
    await seed_synced(page)
    await page.reload()
    await expect(page.locator('.account_name', {hasText: "sync@gmail.com"})).toBeVisible()
    await page.locator('.groups .v-list-item', {hasText: "Synced Group"}).click()
    await expect(page.locator('.contacts .v-list-item', {hasText: "Synced Person"})).toBeVisible()

    // New contact menu offers the synced account (opens dialog)
    await page.locator('.navbar .menu-more-btn').last().click()
    await page.locator('.menuable__content__active .v-list-item', {hasText: "sync@gmail.com"})
        .click()
    const dialog = page.locator('.v-dialog--active')
    await expect(dialog.getByText("New Contact")).toBeVisible()
    await dialog.getByLabel("Full name").fill("Remote Person")
    await dialog.getByLabel("Email address").fill("bad")
    await expect(dialog.getByRole('button', {name: "Create"})).toBeDisabled()
    await dialog.getByRole('button', {name: "Cancel"}).click()

    // New synced group asks for a name
    await page.locator('.groups').getByRole('button', {name: "New group"}).last().click()
    await expect(page.locator('.v-dialog--active')).toBeVisible()
    await page.locator('.v-dialog--active').getByRole('button', {name: "Cancel"}).click()
})


test('synced contact fields open sync dialogs', async ({page, app}) => {
    // Synced contacts can't be edited directly
    await app.open({path: '/contacts/'})
    const {contact} = await seed_synced(page)
    await app.goto(`/contacts/${contact}/`)
    await expect(page.getByText("Synced from account")).toBeVisible()
    await expect(page.getByRole('link', {name: /Open in Google Contacts/i})).toBeVisible()

    // Name and notes prompt for a new value
    for (const label of ["Full name", "Notes"]){
        await page.getByLabel(label).click()
        const dialog = page.locator('.v-dialog--active')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', {name: "Cancel"}).click()
        await expect(dialog).toHaveCount(0)
    }

    // Email opens dialog that needs Google (unreachable, so shows error or loading)
    await page.getByLabel("Email address").click()
    const dialog = page.locator('.v-dialog--active')
    await expect(dialog.getByText("Change email address used")).toBeVisible()
    await dialog.getByRole('button', {name: "Cancel"}).click()
    app.errors.length = 0  // Network failures to Google are expected
})

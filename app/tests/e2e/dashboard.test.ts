
// Dashboard (root route) cards, sidebar navigation and status bar

import {test, expect, app_eval, native_calls} from './fixtures'


test('subscribe requests can be accepted and deleted', async ({page, app}) => {
    // Accepting a subscription request creates a contact in the requested group
    await app.open()
    const card = page.locator('.v-card', {hasText: "Requests to subscribe"})
    await expect(card.getByText("Sub Scriber")).toBeVisible()
    await card.locator('.v-list-item', {hasText: "Sub Scriber"}).locator('button').first().click()
    await expect(card).toBeHidden()
    const contact = await app_eval<{name:string}|undefined>(page, `
        return (await self.app_db.contacts.list()).find(c => c.address === 'sub@example.com')`)
    expect(contact?.name).toBe("Sub Scriber")
})


test('subscribe request can be deleted via menu', async ({page, app}) => {
    // Delete is inside the "more" menu
    await app.open()
    const card = page.locator('.v-card', {hasText: "Requests to subscribe"})
    await card.locator('.v-list-item', {hasText: "Sub Scriber"}).locator('button').nth(1).click()
    await page.locator('.v-menu__content').getByText("Delete").click()
    await expect(card).toBeHidden()
    expect(await app_eval<number>(page, `
        return (await self.app_db._conn.getAll('request_subscribe')).length`)).toBe(0)
})


test('address change requests can be accepted or discarded', async ({page, app}) => {
    // Accepting changes the contact's address
    await app.open()
    const card = page.locator('.v-card', {hasText: "Requests to change address"})
    await card.locator('.v-list-item', {hasText: "Fred Fudge"}).locator('button').first().click()
    await expect(card).toBeHidden()
    const addresses = await app_eval<string[]>(page, `
        return (await self.app_db.contacts.list()).map(c => c.address)`)
    expect(addresses).toContain('new5@example.com')
})


test('address change request can be discarded', async ({page, app}) => {
    // Discarding leaves contact unchanged
    await app.open()
    const card = page.locator('.v-card', {hasText: "Requests to change address"})
    await card.locator('.v-list-item', {hasText: "Fred Fudge"}).locator('button').nth(1).click()
    await expect(card).toBeHidden()
    const addresses = await app_eval<string[]>(page, `
        return (await self.app_db.contacts.list()).map(c => c.address)`)
    expect(addresses).toContain('contact5@example.com')
})


test('resend requests can be discarded', async ({page, app}) => {
    // Discard removes the request
    await app.open()
    const card = page.locator('.v-card', {hasText: "Requests to resend"})
    await expect(card.getByText("Please resend")).toBeVisible()
    await card.locator('.v-list-item').locator('button').nth(1).click()
    await expect(card).toBeHidden()
})


test('resend request creates a new draft for the contact', async ({page, app}) => {
    // Accepting a resend asks for confirmation in a dialog
    await app.open()
    const card = page.locator('.v-card', {hasText: "Requests to resend"})
    await card.getByRole('button', {name: "Resend"}).click()
    await expect(page).toHaveURL(/#\/drafts\/[^/]+\/$/)
    const titles = await app_eval<string[]>(page, `
        return (await self.app_db.drafts.list()).map(d => d.title)`)
    expect(titles.filter(t => t === "First message")).toHaveLength(1)
})


test('new features card can be dismissed', async ({page, app}) => {
    // Card shows until dismissed for current version
    await app.open({seed: 'profile'})
    const card = page.locator('.v-card', {hasText: "New features"})
    await expect(card).toBeVisible()
    await card.getByRole('button', {name: "Dismiss"}).click()
    await expect(card).toBeHidden()
})


test('cloud backup suggestion can be dismissed or opened', async ({page, app}) => {
    // Suggest backup once user has sent a couple of times
    await app.open({seed: 'profile', state: {usage_sends: 5, show_cloudbackup_suggest: true}})
    const card = page.locator('.v-card', {hasText: "Back up your data"})
    await expect(card).toBeVisible()
    await card.getByRole('button', {name: "Backup to Google Drive"}).click()
    const dialog = page.locator('.v-dialog--active')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await card.getByRole('button', {name: "I don't need this"}).click()
    await expect(card).toBeHidden()
})


test('blobstore migration card opens dialog', async ({page, app}) => {
    // Shown for users upgrading from old versions
    await app.open({seed: 'profile', state: {show_blobstore_migrate: true}})
    const card = page.locator('.v-card', {hasText: "Upgrade database"})
    await card.getByRole('button', {name: "Upgrade now"}).click()
    const dialog = page.locator('.v-dialog--active')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button').last().click()
    await expect(card).toBeHidden({timeout: 30 * 1000})
})


test('sidebar navigates to every section', async ({page, app}) => {
    // Each sidebar link loads its route
    await app.open()
    const nav = page.locator('.v-navigation-drawer, .sidebar').first()
    const links = [['Drafts', '#/drafts/'], ['Sent', '#/messages/'],
        ['Responses', '#/replies/'], ['Contacts', '#/contacts/'], ['Settings', '#/settings/'],
        ['About', '#/about/'], ['Dashboard', '#/']] as const
    for (const [label, hash] of links){
        await nav.locator('.v-list-item', {hasText: label}).click()
        await expect(page).toHaveURL(new RegExp(hash.replace(/[/#]/g, '\\$&') + '$'))
    }
})


test('sidebar new message button creates a draft', async ({page, app}) => {
    // New message creates a draft and opens it
    await app.open()
    await page.getByRole('button', {name: "New message"}).click()
    await expect(page).toHaveURL(/#\/drafts\/[^/]+\/$/)
})


test('sidebar guide links to website', async ({page, app}) => {
    // Guide is external so just check the link
    await app.open({seed: 'profile'})
    await expect(page.locator('.sidebar a', {hasText: 'Guide'}))
        .toHaveAttribute('href', 'https://stello.news/guide/')
})


test('dark mode can be toggled', async ({page, app}) => {
    // Dark mode applies class to app root
    await app.open({seed: 'profile'})
    await app_eval(page, 'await self.app_toggle_dark()')
    await expect(page.locator('.v-application.dark')).toBeVisible()
})


test('update bar shows when update ready and restarts app', async ({page, app}) => {
    // Native platform can notify of updates
    await app.open({seed: 'profile'})
    await app_eval(page, 'self.e2e_trigger_update()')
    await page.locator('.reload-bar.update button').click()
    expect(await native_calls(page)).toContainEqual(['restart_after_update'])
})


test('invalid route shows not found page', async ({page, app}) => {
    // Unknown paths show RouteInvalid
    await app.open({seed: 'profile', path: '/does/not/exist/'})
    await expect(page.locator('.docked').last()).toContainText("Where did you want to go")
    await page.getByText("Nevermind").click()
    await expect(page).toHaveURL(/#\/$/)
})

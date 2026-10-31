
// Sending a draft, sent messages list and individual message pages

import {test, expect, app_eval, menu_action, native_calls} from './fixtures'


test.describe('sending', () => {

    test('sending a draft uploads and emails each recipient', async ({page, app, context}) => {
        // Send seeded draft (fake S3 accepts uploads and native shim accepts emails)
        await context.grantPermissions(['clipboard-read', 'clipboard-write'])
        const seeded = await app.open()
        await app.goto(`/drafts/${seeded!.draft}/`)
        await page.locator('.v-toolbar button.v-btn--fab').click()
        await expect(page).toHaveURL(/#\/messages\/[^/]+\/$/)
        await expect(page.locator('.v-toolbar__title')).toHaveText("Seeded draft")

        // Wait for every recipient with an address (and sender's own copy) to be emailed
        const sent_to = async () => (await native_calls(page)).filter(c => c[0] === 'smtp_send')
            .map(c => c[1]).sort()
        await expect.poll(sent_to, {timeout: 45 * 1000}).toEqual(['contact0@example.com',
            'contact1@example.com', 'contact2@example.com', 'sender@example.com'])
        await expect(page.locator('.meta').getByText("Sending")).toBeHidden({timeout: 30 * 1000})
        await expect(page.getByText(/0 of \d+ opened/)).toBeVisible()
        await expect(page.getByText("Some contacts have no address")).toBeVisible()
        expect(await app_eval<number>(page, 'return self.app_store.state.usage_sends'))
            .toBe(1)

        // Contact without an address must be sent to manually (copies invite to clipboard)
        const manual = page.locator('.v-list-item:has-text("Harry Harvard")')
        await manual.locator('.v-list-item__action').first().locator('button').click()
        await expect(page.getByText("Some contacts have no address")).toBeHidden()
    })

    test('send is blocked when draft has no subject', async ({page, app}) => {
        // Barrier explains why sending isn't possible
        const seeded = await app.open()
        await app.goto(`/drafts/${seeded!.draft}/`)
        await page.locator('input.msg-title').fill('')
        const send = page.locator('.v-toolbar button.v-btn--fab')
        await expect(send).toHaveAttribute('data-tip', "Message has no subject")
        await send.click()
        await expect(page).toHaveURL(/#\/drafts\//)
    })
})


test.describe('sent messages list', () => {

    test('lists messages and filters replies', async ({page, app}) => {
        // Seeded messages are replies so hidden when switch on
        await app.open({path: '/messages/'})
        await expect(page.getByText("First message")).toBeVisible()
        await expect(page.getByText("Second message")).toBeVisible()
        await page.getByText("Hide replies").click()
        await expect(page.getByText("First message")).toBeHidden()
        await page.getByText("Hide replies").click()
        await expect(page.getByText("First message")).toBeVisible()
    })

    test('item menu copies, exports, retracts and deletes', async ({page, app}) => {
        // Use every action for a message in the list
        await app.open({path: '/messages/'})
        const item = '.v-list-item:has-text("Second message")'

        // Copy to new draft
        await menu_action(page, item, "Copy to new draft")
        await expect(page).toHaveURL(/#\/drafts\/[^/]+\/$/)
        await expect(page.locator('input.msg-title')).toHaveValue("Second message")
        await app.goto('/messages/')

        // Exports
        const download = page.waitForEvent('download')
        await menu_action(page, item, "Export as webpage")
        await download
        await menu_action(page, item, "Export as PDF")
        await expect.poll(async () => (await native_calls(page)).map(c => c[0]))
            .toContain('html_to_pdf')

        // Retract asks for confirmation
        await menu_action(page, item, "Retract")
        const dialog = page.locator('.v-dialog--active')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button').last().click()
        await expect(page.locator(item)).toContainText(/Expired|Retracted/i)

        // Delete removes from list after confirming
        await menu_action(page, item, "Delete")
        await page.locator('.v-dialog--active').getByRole('button').last().click()
        await expect(page.locator(item)).toHaveCount(0)
    })

    test('view online opens own copy', async ({page, app}) => {
        // Opens the displayer in a new window
        await app.open({path: '/messages/'})
        const popup = page.waitForEvent('popup')
        await page.locator('.v-list-item', {hasText: "First message"}).locator('.view').click()
        expect((await popup).url()).toContain('#')
    })
})


test.describe('message page', () => {

    test('shows stats and copies with reads', async ({page, app}) => {
        // First message's copies were all invited and read once
        const seeded = await app.open()
        await app.goto(`/messages/${seeded!.messages[0]}/`)
        await expect(page.getByText(/\d+ of \d+ opened \(\d+%\)/)).toBeVisible()
        await expect(page.getByText("Adam Andrews")).toBeVisible()
        await expect(page.getByText("Harry Harvard").first()).toBeVisible()
    })

    test('copies can be exported and retracted', async ({page, app}) => {
        // Use per-copy actions
        const seeded = await app.open()
        await app.goto(`/messages/${seeded!.messages[1]}/`)
        const copy = '.v-list-item:has-text("Adam Andrews")'
        await expect(page.locator(copy)).toBeVisible()

        // Export copy
        const download = page.waitForEvent('download')
        await menu_action(page, copy, "Export as webpage")
        await download
        await menu_action(page, copy, "Export as PDF")

        // Retract copy
        await menu_action(page, copy, "Retract")
        const dialog = page.locator('.v-dialog--active')
        if (await dialog.count()){
            await dialog.getByRole('button').last().click()
        }

        // Clicking contact name navigates to contact
        await page.locator(copy).getByRole('link').click()
        await expect(page).toHaveURL(/#\/contacts\/[^/]+\/$/)
    })

    test('message menu resends, copies and exports', async ({page, app}) => {
        // Toolbar menu actions
        const seeded = await app.open()
        await app.goto(`/messages/${seeded!.messages[1]}/`)
        await menu_action(page, '.v-toolbar', "Resend some emails")
        const dialog = page.locator('.v-dialog--active')
        await expect(dialog).toBeVisible()
        await page.keyboard.press('Escape')
        const download = page.waitForEvent('download')
        await menu_action(page, '.v-toolbar', "Export as webpage")
        await download
        await menu_action(page, '.v-toolbar', "Export as PDF")
        await menu_action(page, '.v-toolbar', "Copy to new draft")
        await expect(page).toHaveURL(/#\/drafts\/[^/]+\/$/)
    })

    test('finish sending sends pending copies', async ({page, app}) => {
        // Second message was never sent so all copies are pending
        const seeded = await app.open()
        await app.goto(`/messages/${seeded!.messages[1]}/`)
        await page.getByRole('button', {name: "Finish sending"}).click()
        await expect.poll(async () => (await native_calls(page))
            .filter(c => c[0] === 'smtp_send').length, {timeout: 45 * 1000}).toBeGreaterThan(0)
    })

    test('missing message shows message', async ({page, app}) => {
        // Unknown message id
        await app.open({seed: 'profile', path: '/messages/missing/'})
        await expect(page.getByText("Message does not exist")).toBeVisible()
    })
})

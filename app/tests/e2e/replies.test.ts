
// Responses page: filtering, replying, archiving and deleting replies/reactions

import {test, expect, app_eval, menu_action, native_calls} from './fixtures'

import type {Page} from '@playwright/test'


function replaction(page:Page, text:string){
    // Locate a single reply/reaction
    return page.locator('.root', {hasText: text}).first()
}


test('lists replies and reactions grouped by section', async ({page, app}) => {
    // Seeded first message has general replies, section replies and reactions
    await app.open({path: '/replies/'})
    await expect(page.getByText("General reply 0")).toBeVisible()
    await expect(page.getByText("Section reply 0")).toBeVisible()
    await expect(page.locator('.reaction').first()).toBeVisible()

    // Section content can be expanded
    await page.locator('.expand button').first().click()
    await expect(page.locator('.section_content.expanded').first()).toBeVisible()

    // Clicking message title opens message
    await page.locator('.header span', {hasText: "First message"}).first().click()
    await expect(page).toHaveURL(/#\/messages\/[^/]+\/$/)
})


test('filters by archived, contact and message', async ({page, app}) => {
    // Filters reduce visible replies
    await app.open({path: '/replies/'})
    await expect(page.getByText("General reply 1")).toBeVisible()

    // Contact filter
    await page.locator('.filters .v-select').nth(0).click()
    await page.locator('.menuable__content__active .v-list-item').first().click()
    await expect(page.locator('.root')).not.toHaveCount(0)
    await page.locator('.filters .v-select').nth(0).locator('button').first().click()

    // Message filter
    await page.locator('.filters .v-select').nth(1).click()
    await page.locator('.menuable__content__active .v-list-item', {hasText: "First message"})
        .click()
    await expect(page.getByText("General reply 1")).toBeVisible()
    await page.locator('.filters .v-select').nth(1).locator('button').first().click()

    // Archive a reply then hide archived
    await replaction(page, "General reply 1").locator('[data-tip="Archive"]').click()
    await expect(replaction(page, "General reply 1")).toBeHidden()
    await page.getByText("Hide archived").click()
    await expect(replaction(page, "General reply 1")).toBeVisible()
    await replaction(page, "General reply 1").locator('[data-tip="Unarchive"]').click()
})


test('reply opens dialog and sends via email', async ({page, app}) => {
    // Reply to a contact's reply using Stello (sender's own copy has no contact to reply to)
    await app.open({path: '/replies/'})
    await page.locator('.root', {hasText: "Adam Andrews"}).filter({hasText: "General reply"})
        .locator('[data-tip="Reply"]').click()
    const dialog = page.locator('.v-dialog--active')
    await expect(dialog.getByText(/Reply to/)).toBeVisible()
    await dialog.locator('.ProseMirror').focus()
    await page.keyboard.type("Thanks for your reply")
    await dialog.getByRole('button', {name: "Send"}).click()
    await expect.poll(async () => (await native_calls(page)).filter(c => c[0] === 'smtp_send')
        .length, {timeout: 45 * 1000}).toBeGreaterThan(0)
})


test('reply dialog can open full editor', async ({page, app}) => {
    // "More options" converts reply into a full draft
    await app.open({path: '/replies/'})
    await replaction(page, "Section reply 0").locator('[data-tip="Reply"]').click()
    await page.locator('.v-dialog--active').getByRole('button', {name: "More options"}).click()
    await expect(page).toHaveURL(/#\/drafts\/[^/]+\/$/)
    await expect(page.locator('input.msg-title')).toHaveValue(/First message/)
})


test('replies can be deleted individually and in bulk', async ({page, app}) => {
    // Delete single then archive/delete all in a subsection
    await app.open({path: '/replies/'})
    await menu_action(page, replaction(page, "General reply 0"), "Delete")
    await expect(page.getByText("General reply 0")).toBeHidden()

    const subsection = page.locator('.v-card', {hasText: "General reply 1"})
    await menu_action(page, subsection.locator('.header'), "Archive all")
    await expect(page.getByText("General reply 1")).toBeHidden()
    await page.getByText("Hide archived").click()
    const subsection_again = page.locator('.v-card', {hasText: "General reply 1"})
    await menu_action(page, subsection_again.locator('.header'), "Delete all")
    const confirm = page.locator('.v-dialog--active')
    if (await confirm.count()){
        await confirm.getByRole('button').last().click()
    }
    await expect(page.getByText("General reply 1")).toBeHidden()
    expect(await app_eval<number>(page, 'return (await self.app_db.replies.list()).length'))
        .toBe(8)
})


test('download checks for new responses', async ({page, app}) => {
    // Triggers responses task against fake (empty) storage
    await app.open({path: '/replies/'})
    await page.locator('.download').click()
    await expect(page.locator('.statusbar')).toBeVisible()
})


test('no responses shows placeholder', async ({page, app}) => {
    // Empty state
    await app.open({seed: 'profile', path: '/replies/'})
    await expect(page.getByText("No responses")).toBeVisible()
})

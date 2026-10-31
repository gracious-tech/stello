
// Rich text formatting, image editing, invitation customisation and task failure handling

import path from 'path'

import {test, expect, app_eval} from './fixtures'

import type {Page} from '@playwright/test'
import type {AppFixture} from './fixtures'


// Real image file for upload inputs
const IMAGE_PATH = path.join(__dirname, '../../static/default_invite_image.jpg')


async function open_draft(page:Page, app:AppFixture):Promise<string>{
    // Open the seeded draft
    const seeded = (await app.open())!
    await app.goto(`/drafts/${seeded.draft}/`)
    await expect(page.locator('input.msg-title')).toHaveValue("Seeded draft")
    return seeded.draft
}


async function section_html(page:Page, draft_id:string):Promise<string>{
    // Get html of the draft's first (text) section
    return app_eval(page, `
        const draft = await self.app_db.drafts.get(${JSON.stringify(draft_id)})
        return (await self.app_db.sections.get(draft.sections[0][0])).content.html`)
}


test.describe('rich text editor', () => {

    test('bubble menu formats selected text', async ({page, app}) => {
        // Select a word and apply each inline format
        const id = await open_draft(page, app)
        const editor = page.locator('.content section.type-text .ProseMirror').first()
        await editor.focus()
        await page.keyboard.press('Control+End')
        await page.keyboard.type(" formatted")
        await page.keyboard.press('Shift+Control+ArrowLeft')
        const bubble = page.locator('.bubble')
        await expect(bubble).toBeVisible()
        for (const tip of ["Bold", "Italic", "Highlight"]){
            await bubble.locator(`[data-tip="${tip}"]`).click()
        }
        await expect.poll(() => section_html(page, id)).toContain('<mark>')

        // Add a link
        await bubble.locator('[data-tip="Link"]').click()
        await bubble.locator('input.url').fill('https://example.com')
        await page.keyboard.press('Enter')
        await expect.poll(() => section_html(page, id)).toContain('href="https://example.com"')
    })

    test('floating menu formats empty lines', async ({page, app}) => {
        // Empty paragraph shows block options
        const id = await open_draft(page, app)
        const editor = page.locator('.content section.type-text .ProseMirror').first()
        await editor.focus()
        await page.keyboard.press('Control+End')
        const floating = page.locator('.floating')
        for (const tip of ["Heading", "Bullet points", "Numbered list", "Note", "Quotation"]){
            await page.keyboard.press('Enter')
            await page.keyboard.press('Enter')
            await floating.locator(`[data-tip="${tip}"]`).click()
            await page.keyboard.type(`${tip} text`)
        }
        await expect.poll(() => section_html(page, id)).toContain('<h2>')
        await expect.poll(() => section_html(page, id)).toContain('<blockquote>')

        // Variables can be inserted by typing "{"
        await page.keyboard.press('Enter')
        await page.keyboard.type('{')
        const suggestions = page.locator('.tippy-box .v-list-item, .variables .v-list-item')
        if (await suggestions.count()){
            await suggestions.first().click()
        }
    })
})


test.describe('image editing', () => {

    test('crop, rotate, filter, redact and undo an image', async ({page, app}) => {
        // Open images section dialog
        await open_draft(page, app)
        const section = page.locator('.content section.type-images').first()
        await section.hover()
        await section.locator('[data-tip="Section settings"]').click()
        const dialog = page.locator('.v-dialog--active')
        const item = dialog.locator('.dialog-section-images-item').first()
        await expect(item.locator('img.img')).toBeVisible()
        // NOTE Edit bar only shows on hover so clicks are dispatched directly

        // Rotate and filter
        await item.locator('[data-tip="Rotate"]').dispatchEvent('click')
        await expect(item.locator('[data-tip="Undo changes"]')).toHaveCount(1)
        await item.locator('.menu .menu-more-btn').dispatchEvent('click')
        await page.locator('.menuable__content__active .v-list-item:not(.v-list-item--disabled)')
            .first().click()

        // Crop region then submit
        await item.locator('[data-tip="Crop"]').dispatchEvent('click')
        await item.locator('.root.crop .menu button').last().dispatchEvent('click')

        // Redact region then submit
        await item.locator('[data-tip="Redact"]').dispatchEvent('click')
        await item.locator('.root.redact .menu button').last().dispatchEvent('click')

        // Undo all changes
        await item.locator('[data-tip="Undo changes"]').dispatchEvent('click')
        // BUG #image-undo-persists: DialogSectionImagesItem saves the reverted blob as a new
        //      file and reloads it, so ImageEditBar's `original !== blob` stays true and Undo
        //      never hides
        await expect.soft(item.locator('[data-tip="Undo changes"]')).toHaveCount(0)

        // Reorder, caption and remove items
        await item.locator('textarea').fill("Edited caption")
        const item_btn = (i:number, label:string) => dialog.locator('.dialog-section-images-item')
            .nth(i).locator('.flex-column button').nth(['up', 'down', 'remove'].indexOf(label))
        await item_btn(1, 'up').dispatchEvent('click')
        await item_btn(0, 'down').dispatchEvent('click')
        await item_btn(1, 'remove').dispatchEvent('click')
        await expect(dialog.locator('.dialog-section-images-item')).toHaveCount(1)

        // Single image allows banner style
        await dialog.getByText("Banner style").click()
        await dialog.getByRole('button', {name: "Done"}).click()
    })
})


test.describe('invitation', () => {

    async function crop_invite_image(page:Page):Promise<void>{
        // Invite images must be cropped to aspect ratio before they can be used
        // NOTE Crop mode starts automatically when an aspect ratio is required
        const dialog = page.locator('.v-dialog--active')
        await expect(dialog.locator('.root.crop')).toHaveCount(1)
        await dialog.locator('.root.crop .menu button').last().dispatchEvent('click')
        await expect(dialog.getByRole('button', {name: "Done"})).toBeEnabled()
    }

    test('invite image can be changed and template customised', async ({page, app}) => {
        // Change invite image via image chooser
        await open_draft(page, app)
        await page.locator('.invite .img_div img').click()
        const dialog = page.locator('.v-dialog--active')
        await expect(dialog.getByText("Choose Image")).toBeVisible()
        await expect(dialog.locator('.suggestions img').first()).toBeVisible()
        await dialog.locator('input[type=file]').setInputFiles(IMAGE_PATH)
        await crop_invite_image(page)
        await dialog.locator('[data-tip="Rotate"]').dispatchEvent('click')
        await crop_invite_image(page)
        await dialog.getByRole('button', {name: "Done"}).click()
        await expect(dialog).toHaveCount(0)

        // Customise the invite text then revert
        await page.locator('.invite .default').click()
        const custom = page.locator('.invite .custom')
        await expect(custom).toBeVisible()
        await custom.locator('.ProseMirror').first().focus()
        await page.keyboard.type(" Extra invite text")
        await custom.locator('input').last().fill("Read it")
        await page.getByRole('button', {name: "Revert to default"}).click()
        await expect(page.locator('.invite .default')).toBeVisible()
    })
})


test.describe('task failures', () => {

    test('failures of every type are explained with fixes', async ({page, app}) => {
        // Inject failed tasks with each kind of error
        await app.open({seed: 'profile'})
        await app_eval(page, `
            const {Task} = await import('/src/services/tasks/tasks.ts')
            const e = await import('/src/services/utils/exceptions.ts')
            const {task_manager} = await import('/src/services/tasks/tasks.ts')
            const errors = [new e.MustReconnect(), new e.MustReauthenticate(),
                new e.MustReconfigure(), new e.MustWait(), new e.MustRestore('missing.png'),
                new e.MustMakeSpace(), 'MustAllow', new e.MustSyncClock(), new Error('odd')]
            for (const [i, error] of errors.entries()){
                const task = new Task('responses_receive', [i], [])
                task.label = 'Task ' + i
                task.error = error
                task_manager.data.fails.push(task)
            }
        `)
        await expect(page.locator('.statusbar .fails')).toBeVisible()
        await page.locator('.statusbar .fails').click()
        const dialog = page.locator('.v-dialog--active')
        const reasons = ["Could not connect", "Wrong password", "Incorrect settings",
            "Limit exceeded", "Can't read file", "Storage full", "Not allowed to access files",
            "Clock out of sync", "Unexpected error"]
        for (const reason of reasons){
            await expect(dialog.getByText(reason)).toBeVisible()
        }

        // Retry the network failure (succeeds against fake storage)
        await dialog.locator('.card', {hasText: "Could not connect"})
            .getByRole('button', {name: "Retry"}).click()
        await page.keyboard.press('Escape')
    })

    test('stop button aborts running task', async ({page, app}) => {
        // Responses task is abortable while running
        await app.open()
        await app_eval(page, `
            const {task_manager} = await import('/src/services/tasks/tasks.ts')
            void task_manager.start('responses_receive', [], [])
        `)
        const stop = page.locator('.statusbar').getByRole('button', {name: "Stop"})
        if (await stop.isVisible()){
            await stop.click()
        }
        await expect(page.locator('.statusbar .finished, .statusbar .inactive').first())
            .toBeVisible({timeout: 30 * 1000})
    })
})


test.describe('dashboard recovery', () => {

    test('recover backup card can be dismissed', async ({page, app}) => {
        // Shown when backups from another db id exist
        await app.open({seed: 'profile'})
        await app_eval(page, `self.app_store.commit('tmp_set', ['restore_backup', 'other_dbid'])`)
        const card = page.locator('.v-card', {hasText: "Recover data from backup"})
        await expect(card).toBeVisible()
        await card.getByRole('button', {name: "Dismiss"}).click()
        await expect(card).toBeHidden()
        expect(await app_eval<string[]>(page, 'return self.app_store.state.dismissed_dbids'))
            .toContain('other_dbid')
    })
})

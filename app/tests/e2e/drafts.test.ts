
// Drafts list, draft editor, section dialogs and page sections

import path from 'path'

import {test, expect, app_eval, native_calls} from './fixtures'

import type {Page} from '@playwright/test'
import type {AppFixture} from './fixtures'


// Real image file for upload inputs
const IMAGE_PATH = path.join(__dirname, '../../static/default_invite_image.jpg')


async function open_draft(page:Page, app:AppFixture):Promise<string>{
    // Open the seeded draft and wait for its sections to render
    const seeded = (await app.open())!
    await app.goto(`/drafts/${seeded.draft}/`)
    await expect(page.locator('input.msg-title')).toHaveValue("Seeded draft")
    return seeded.draft
}


async function draft_record(page:Page, id:string):Promise<Record<string, unknown>>{
    // Get saved draft from db
    return app_eval(page, `return self.app_db.drafts.get(${JSON.stringify(id)})`)
}


function section_of(page:Page, type:string){
    // Locate an editor section by its type class
    return page.locator(`.content section.type-${type}`).first()
}


async function open_section_settings(page:Page, type:string):Promise<void>{
    // Click the settings button of a section to open its dialog
    const section = section_of(page, type)
    await section.hover()
    await section.locator('[data-tip="Section settings"]').click()
    await expect(page.locator('.v-dialog--active')).toBeVisible()
}


async function add_section(page:Page, tip:string, bar='.add-end'):Promise<void>{
    // Add a section via an add bar
    // NOTE Buttons only show on hover and layout keeps shifting, so dispatch click directly
    await page.locator(bar).last().locator(`[data-tip="${tip}"]`).dispatchEvent('click')
}


async function close_dialog(page:Page, label='Done'):Promise<void>{
    // Close the active dialog via its button
    await page.locator('.v-dialog--active').getByRole('button', {name: label}).click()
    await expect(page.locator('.v-dialog--active')).toHaveCount(0)
}


test.describe('drafts list', () => {

    test('lists drafts and templates and creates new ones', async ({page, app}) => {
        // Both lists show seeded items
        await app.open({path: '/drafts/'})
        await expect(page.getByText("Seeded draft")).toBeVisible()
        await expect(page.getByText("Seeded template")).toBeVisible()

        // New template opens editor in template mode
        await page.getByRole('button', {name: "New template"}).click()
        await expect(page.getByText("This is only a template")).toBeVisible()
        await page.locator('input.msg-title').fill("My template")
        await page.locator('.v-toolbar a').first().click()

        // New draft opens editor
        await page.getByRole('button', {name: "New draft", exact: true}).click()
        await expect(page).toHaveURL(/#\/drafts\/[^/]+\/$/)
        await expect(page.locator('input.msg-title')).toBeVisible()
    })

    test('item menu duplicates, templates, exports and deletes', async ({page, app}) => {
        // Use each action in the item's menu
        await app.open({path: '/drafts/'})
        const item = () => page.locator('.v-list-item', {hasText: "Seeded draft"}).first()
        const menu_action = async (label:string) => {
            await item().locator('.menu-more-btn').click()
            await page.locator('.menuable__content__active').getByText(label).click()
        }

        // Duplicate adds another draft
        await menu_action("Duplicate")
        await expect(page.locator('.v-list-item', {hasText: "Seeded draft"})).toHaveCount(2)

        // Export as webpage and PDF trigger downloads / native call
        const download = page.waitForEvent('download')
        await menu_action("Export as webpage")
        expect((await download).suggestedFilename()).toMatch(/\.html$/)
        await menu_action("Export as PDF")
        await expect.poll(async () => (await native_calls(page)).map(c => c[0]))
            .toContain('html_to_pdf')

        // Turn into template moves it to templates
        await menu_action("Turn into template")
        await expect(page.locator('.v-list-item', {hasText: "Seeded draft"})).toHaveCount(2)

        // Delete removes it
        await menu_action("Delete")
        await expect(page.locator('.v-list-item', {hasText: "Seeded draft"})).toHaveCount(1)
    })

    test('templates can be made default and used for new drafts', async ({page, app}) => {
        // Template actions
        await app.open({path: '/drafts/'})
        const template = page.locator('.v-list-item', {hasText: "Seeded template"})
        await template.locator('.menu-more-btn').click()
        await page.locator('.menuable__content__active').getByText("Make default").click()
        await expect(template.getByText("default")).toBeVisible()

        // Copy to a new (non-template) draft which is added to the list
        await template.locator('[data-tip="Use for new draft"]').click()
        await expect(page.locator('.v-list-item', {hasText: "Seeded template"})).toHaveCount(2)
    })
})


test.describe('draft editor', () => {

    test('renders all section types and edits title', async ({page, app}) => {
        // Seeded draft has one of each section type
        const id = await open_draft(page, app)
        for (const type of ['text', 'images', 'video', 'chart', 'files', 'page']){
            await expect(section_of(page, type)).toBeVisible()
        }
        await page.locator('input.msg-title').fill("Changed title")
        await expect.poll(async () => (await draft_record(page, id))['title'])
            .toBe("Changed title")
    })

    test('text can be edited with formatting', async ({page, app}) => {
        // Type into the rich text editor
        const id = await open_draft(page, app)
        // NOTE Slideshow in same row keeps resizing so element is never "stable" for clicking
        const editor = section_of(page, 'text').locator('.ProseMirror')
        await editor.focus()
        await page.keyboard.press('Control+End')
        await page.keyboard.type(" Extra words")
        await page.keyboard.press('Shift+Home')
        await page.keyboard.press('Control+b')
        await expect(editor).toContainText("Extra words")
        await expect.poll(async () => {
            const sections = (await draft_record(page, id))['sections'] as string[][]
            const section = await app_eval<{content:{html:string}}>(page,
                `return self.app_db.sections.get(${JSON.stringify(sections[0]![0])})`)
            return section.content.html
        }).toContain("Extra words")
    })

    test('text settings dialog changes standout', async ({page, app}) => {
        // Choose a standout style
        await open_draft(page, app)
        await open_section_settings(page, 'text')
        await page.locator('.v-dialog--active').getByText("Important").click()
        await close_dialog(page)
        await expect(section_of(page, 'text')).toHaveClass(/important/)
    })

    test('images dialog adds images and toggles options', async ({page, app}) => {
        // Upload another image and toggle crop
        await open_draft(page, app)
        await open_section_settings(page, 'images')
        const dialog = page.locator('.v-dialog--active')
        await dialog.locator('input[type=file]').setInputFiles(IMAGE_PATH)
        await expect(dialog.locator('.v-card-text img, .v-card__text img')).toHaveCount(3,
            {timeout: 30 * 1000})
        await dialog.getByText("Crop to same size").click()
        await close_dialog(page)
    })

    test('video dialog validates and parses urls', async ({page, app}) => {
        // Enter invalid then valid youtube URLs and timing
        await open_draft(page, app)
        await open_section_settings(page, 'video')
        const dialog = page.locator('.v-dialog--active')
        const url = dialog.getByLabel("Video URL")
        await url.fill('not a url')
        await expect(dialog.locator('.error--text').first()).toBeVisible()
        await url.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30')
        await dialog.getByLabel("Start").fill('0:10')
        await dialog.getByLabel("End").fill('1:20')
        await dialog.getByLabel("Caption").fill("New caption")
        await dialog.getByRole('button', {name: "Not playing?"}).click()
        await expect(dialog.getByText("may be banned")).toBeVisible()
        await close_dialog(page)
    })

    test('chart dialog edits data and type', async ({page, app}) => {
        // Change title, add row, reorder, remove, change type
        await open_draft(page, app)
        await open_section_settings(page, 'chart')
        const dialog = page.locator('.v-dialog--active')
        await dialog.getByLabel("Chart title").fill("New chart title")
        await dialog.getByLabel("Threshold").fill('$20')
        await dialog.getByRole('button', {name: "Add item"}).click()
        const rows = dialog.locator('.item')
        await expect(rows).toHaveCount(3)
        await rows.nth(2).locator('input').nth(0).fill("Rent")
        await rows.nth(2).locator('input').nth(1).fill('12')
        await rows.nth(2).locator('button').nth(1).click()  // Move up
        await rows.nth(0).locator('.menu-more-btn').click()
        await page.locator('.menuable__content__active .v-list-item').nth(3).click()
        await rows.nth(1).locator('button').last().click()  // Remove
        await expect(rows).toHaveCount(2)
        for (const type of ["Trend", "Breakdown", "Comparison"]){
            await dialog.getByText(type).click()
        }
        await close_dialog(page)
        await expect(section_of(page, 'chart')).toContainText("New chart title")
    })

    test('files dialog renames, adds and removes files', async ({page, app}) => {
        // Manage files of a files section
        await open_draft(page, app)
        await open_section_settings(page, 'files')
        const dialog = page.locator('.v-dialog--active')
        await dialog.locator('input[type=file]').setInputFiles(IMAGE_PATH)
        await expect(dialog.getByText("Multiple files will be combined")).toBeVisible()
        await dialog.locator('.name input').first().fill("Renamed")
        await dialog.locator('.contents input').fill("Get them")
        await dialog.locator('.v-list-item').first().locator('button').click()
        await expect(dialog.getByText("Multiple files will be combined")).toBeHidden()
        await close_dialog(page)
    })

    test('page section opens subpage editor', async ({page, app}) => {
        // Clicking a page section navigates into it
        const id = await open_draft(page, app)
        await section_of(page, 'page').locator('.pagebait').dispatchEvent('click')
        await expect(page).toHaveURL(new RegExp(`#/drafts/${id}/.+/$`))
        await expect(page.getByText("Text inside a page")).toBeVisible()

        // Add a section inside page then return to draft
        await add_section(page, "Add text")
        await page.locator('.v-toolbar a').first().click()
        await expect(page).toHaveURL(new RegExp(`#/drafts/${id}/$`))
    })

    test('sections can be added, moved, merged and cut', async ({page, app}) => {
        // Use the add bar for each type and the movebar
        const id = await open_draft(page, app)
        const before = ((await draft_record(page, id))['sections'] as string[][]).length

        // Text adds immediately
        await add_section(page, "Add text")
        await expect.poll(async () => ((await draft_record(page, id))['sections'] as string[][])
            .length).toBe(before + 1)

        // Other types open their dialog straight away
        for (const tip of ["Add video", "Add chart", "Add images", "Add files"]){
            await add_section(page, tip)
            await expect(page.locator('.v-dialog--active')).toBeVisible()
            await page.keyboard.press('Escape')
            await expect(page.locator('.v-dialog--active')).toHaveCount(0)
        }

        // Page navigates into new page
        await add_section(page, "Add page")
        await expect(page).toHaveURL(new RegExp(`#/drafts/${id}/.+/$`))
        await page.goBack()

        // Move first row down then back up, separate it, merge again and swap
        // NOTE Bar is positioned out of view so dispatch clicks (only when enabled like a user)
        const movebar = async (row:number, button:number) => {
            const target = page.locator('.movebar').nth(row).locator('button').nth(button)
            await expect(target).toBeEnabled()
            await target.dispatchEvent('click')
        }
        await movebar(0, -1)
        await movebar(1, 0)
        const rows_before = ((await draft_record(page, id))['sections'] as string[][]).length
        const toggles = page.locator('.movebar button:nth-child(2):not([disabled])')
        await toggles.first().dispatchEvent('click')
        await expect.poll(async () => ((await draft_record(page, id))['sections'] as string[][])
            .length).not.toBe(rows_before)
        const swap = page.locator('.movebar [data-tip="Swap positions"]')
        if (await swap.count()){
            await swap.first().dispatchEvent('click')
        }

        // Cut a section (count via db as old route may still be transitioning out)
        const count = async () => ((await draft_record(page, id))['sections'] as string[][])
            .flat().length
        const initial = await count()
        const last = page.locator('.docked').last().locator('.content section.section').last()
        await last.hover()
        await last.locator('[data-tip="Cut section"]').click()
        await expect.poll(count).toBe(initial - 1)

        // Paste it back
        await add_section(page, "Paste section")
        await expect.poll(count).toBe(initial)
    })


    test('meta dialogs change sender, recipients and expiry', async ({page, app}) => {
        // Open each meta dialog via the header
        await open_draft(page, app)

        // Sender
        await page.locator('.meta .profile').click()
        let dialog = page.locator('.v-dialog--active')
        await dialog.getByLabel("Name").fill("Other Name")
        await close_dialog(page, 'Close')
        await expect(page.locator('.meta .profile')).toContainText("Other Name")

        // Recipients: toggle a group and contacts, search and filter
        await page.locator('.meta .recipients').click()
        dialog = page.locator('.v-dialog--active')
        await dialog.locator('.v-list-item', {hasText: "Family"}).click()
        await dialog.locator('.v-list-item', {hasText: "All contacts"}).first().click()
        await dialog.getByRole('tab', {name: "Contacts"}).click()
        await dialog.locator('.v-chip', {hasText: "Non-Recipients"}).click()
        await dialog.locator('.v-chip', {hasText: "Recipients"}).first().click()
        await dialog.locator('.v-chip', {hasText: "All"}).click()
        await dialog.locator('.contacts .v-list-item').first().click()
        await dialog.locator('input[placeholder="Search..."]').fill("Ben")
        await expect(dialog.locator('.contacts .v-list-item')).toHaveCount(1)
        await dialog.getByRole('button', {name: "Clear search"}).click()
        await close_dialog(page, 'Close')

        // Expiry
        await page.locator('.meta .security').click()
        dialog = page.locator('.v-dialog--active')
        await dialog.locator('.v-select').first().click()
        await page.locator('.menuable__content__active .v-list-item').nth(1).click()
        await close_dialog(page, 'Close')
    })

    test('appearance dialog, export and delete via menu', async ({page, app}) => {
        // Draft-level menu actions
        await open_draft(page, app)
        const menu = async (label:string) => {
            await page.locator('.meta .menu-more-btn').click()
            await page.locator('.menuable__content__active').getByText(label).click()
        }

        // Theme
        await menu("Change appearance")
        await expect(page.locator('.v-dialog--active')).toBeVisible()
        await page.keyboard.press('Escape')

        // Exports
        const download = page.waitForEvent('download')
        await menu("Export as webpage")
        await download
        await menu("Export as PDF")

        // Toggle message dark mode
        await page.locator('.stello-displayer .dark_toggle').click()

        // Delete returns to drafts list
        await menu("Delete draft")
        await expect(page).toHaveURL(/#\/drafts\/$/)
        await expect(page.getByText("Seeded draft")).toHaveCount(0)
    })

    test('missing draft shows message', async ({page, app}) => {
        // Unknown draft id
        await app.open({seed: 'profile', path: '/drafts/missing/'})
        await expect(page.getByText("Draft does not exist")).toBeVisible()
    })

    test('draft without account prompts to create one', async ({page, app}) => {
        // No profile so must create one before sending
        await app.open({seed: 'none'})
        await page.getByRole('button', {name: "New message"}).click()
        await expect(page.getByRole('button', {name: "Create account to send"})).toBeVisible()
        await page.locator('.v-toolbar button.v-btn--fab, .v-toolbar [data-tip]').last().click()
        await expect(page.locator('.v-dialog--active, .v-snack')).toBeVisible()
    })
})

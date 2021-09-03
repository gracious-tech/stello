
import {test} from './playwright.config'


test("Visit all routes", async ({page}) => {
    await page.click('nav :text("Drafts")')
    await page.click('nav :text("Sent")')
    await page.click('nav :text("Responses")')
    await page.click('nav :text("Contacts")')
    await page.click('nav :text("Settings")')
    await page.click('nav :text("About")')
})

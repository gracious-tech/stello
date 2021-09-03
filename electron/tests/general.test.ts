
import {test, expect} from './playwright.config'


test("Visit all main routes", async ({page}) => {
    // Visit all main routes to ensure none of them trigger errors
    // NOTE Must use nth as old header will still be present while animating away
    await page.click('nav :text("Drafts")')
    expect(await page.textContent('header >> nth=-1')).toBe("Drafts")
    await page.click('nav :text("Sent")')
    expect(await page.textContent('header >> nth=-1')).toBe("Sent Messages")
    await page.click('nav :text("Responses")')
    expect(await page.textContent('header >> nth=-1')).toBe("Responses")
    await page.click('nav :text("Contacts")')
    expect(await page.textContent('header >> nth=-1')).toBe("Contacts")
    await page.click('nav :text("Settings")')
    expect(await page.textContent('header >> nth=-1')).toBe("Settings")
    await page.click('a:has-text("Storage manager")')
    expect(await page.textContent('header >> nth=-1')).toBe("Storage Manager")
    await page.click('nav :text("About")')
    expect(await page.textContent('header >> nth=-1')).toBe("About")
})


test("Visit dynamic routes without valid id", async ({page, gotohash}) => {
    // Visit dynamic routes without ids to ensure they don't break app when missing
    await gotohash('#/drafts/invalid/')
    expect(await page.textContent('header >> nth=-1')).toBe("")
    await gotohash('#/messages/invalid/')
    expect(await page.textContent('header >> nth=-1')).toBe("")
    await gotohash('#/contacts/invalid/')
    expect(await page.textContent('header >> nth=-1')).toBe("")
    await gotohash('#/settings/profiles/')
    expect(await page.textContent('header >> nth=-1')).toBe("Settings")
    await gotohash('#/settings/profiles/invalid/')
    expect(await page.textContent('header >> nth=-1')).toBe("")
    await gotohash('#/invalid/')
    expect(await page.textContent('header >> nth=-1')).toBe("")
})

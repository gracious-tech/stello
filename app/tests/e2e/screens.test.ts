// Visual regression tests: screenshots of main screens compared against committed baselines
// Update baselines after intended UI changes with `.bin/audit_e2e_app screens --update-snapshots`

import {expect, test} from './fixtures'
import type {Page} from '@playwright/test'


// Fixed time so dates and relative times in seeded data render identically every run
const NOW = new Date('2026-06-15T10:00:00Z')


// Freeze time before the app loads
test.beforeEach(async ({page}) => {
    await page.clock.setFixedTime(NOW)
})


// Wait for content (including images) to settle before comparing
async function settle(page:Page):Promise<void>{
    await page.waitForLoadState('networkidle')
    // NOTE Passed as a string since this file isn't type checked with DOM types
    await page.evaluate('document.fonts.ready.then(() => null)')
}


// Screens of the full seeded app, keyed by screenshot name
const SCREENS:Record<string, (ids:{draft:string, msg:string, contact:string, profile:string})
        => string> = {
    dashboard: () => '/',
    drafts: () => '/drafts/',
    draft: ids => `/drafts/${ids.draft}/`,
    messages: () => '/messages/',
    message: ids => `/messages/${ids.msg}/`,
    replies: () => '/replies/',
    contacts: () => '/contacts/',
    contact: ids => `/contacts/${ids.contact}/`,
    settings: () => '/settings/',
    profile: ids => `/settings/profiles/${ids.profile}/`,
}


// Each main screen matches its baseline
for (const [name, path_for] of Object.entries(SCREENS)){
    test(`screen: ${name}`, async ({page, app}) => {
        const seed = (await app.open({seed: 'full'}))!
        await app.goto(path_for({draft: seed.draft, msg: seed.messages[0]!,
            contact: seed.contacts[0]!, profile: seed.profile}))
        await settle(page)
        await expect(page).toHaveScreenshot(`${name}.png`, {fullPage: true})
    })
}

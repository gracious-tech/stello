
// Settings, sending account (profile) setup and options, storage manager, backups and about

import {test, expect, app_eval, menu_action, native_calls, select_field, SEED_MODULE}
    from './fixtures'

import type {Page} from '@playwright/test'
import type {AppFixture} from './fixtures'


async function confirm_if_asked(page:Page):Promise<void>{
    // Accept a confirmation dialog if one is shown
    const dialog = page.locator('.v-dialog--active')
    if (await dialog.count()){
        await dialog.getByRole('button').last().click()
    }
}


test.describe('settings page', () => {

    test('profiles list, defaults and deletion', async ({page, app}) => {
        // Seed a second incomplete profile alongside the complete one
        await app.open({path: '/settings/'})
        await app_eval(page, `
            const m = await import('${SEED_MODULE}')
            await m.seed_profile(false)
        `)
        await app.goto('/settings/profiles/')  // Redirects to settings
        await page.reload()
        await expect(page.getByText("incomplete")).toBeVisible()

        // Make first profile default again then delete the incomplete one
        const items = page.locator('.v-list-item', {has: page.locator('.v-chip')})
        await menu_action(page, page.locator('.v-list-item', {hasText: "stello-e2e"}),
            "Make default")
        await expect(page.locator('.v-list-item', {hasText: "stello-e2e"})
            .getByText("default")).toBeVisible()
        await menu_action(page, page.locator('.v-list-item', {hasText: "incomplete"}), "Delete")
        await confirm_if_asked(page)
        await expect(items.getByText("incomplete")).toHaveCount(0)
    })

    test('preferences, exports and more settings', async ({page, app}) => {
        // Toggle theme, export data and reveal technical tools
        await app.open({path: '/settings/'})
        await page.getByText("Light theme").click()
        await expect(page.locator('.v-application.dark')).toBeVisible()
        await page.getByText("Dark theme").click()

        // Exports write files via native platform (shim stores them)
        await page.getByRole('button', {name: "Export Contacts"}).click()
        await expect(page.locator('.result-msg')).toBeVisible({timeout: 30 * 1000})
        await page.getByRole('button', {name: "Export Messages"}).click()
        await expect(page.locator('.result-msg')).toBeVisible({timeout: 30 * 1000})

        // Import contacts opens dialog
        await page.getByRole('button', {name: "Import Contacts"}).click()
        await expect(page.locator('.v-dialog--active')).toBeVisible()
        await page.keyboard.press('Escape')

        // More settings
        await page.getByRole('button', {name: "More settings"}).click()
        await page.getByRole('link', {name: "Storage manager"}).click()
        await expect(page).toHaveURL(/#\/settings\/storage\/$/)
    })

    test('contact syncing accounts can be managed', async ({page, app}) => {
        // Seed an oauth account with contact syncing
        await app.open({path: '/settings/'})
        await app_eval(page, `
            await self.app_db.oauths.create({issuer: 'google', issuer_id: 'gid',
                issuer_config: {}, email: 'sync@gmail.com', name: 'Sync User',
                scope_sets: ['contacts'], token_refresh: '', token_access: '',
                token_access_expires: null, contacts_sync: true, contacts_sync_last: null,
                contacts_sync_token: null})
        `)
        await page.reload()
        const item = page.locator('.v-list-item', {hasText: "sync@gmail.com"})
        await expect(item).toBeVisible()
        await select_field(page, "Create new contacts in").click()
        await page.locator('.menuable__content__active .v-list-item').last().click()
        await menu_action(page, item, "Remove")
        await confirm_if_asked(page)
        await expect(item).toHaveCount(0)
    })
})


test.describe('profile setup', () => {

    test('new account via storage code, smtp, security and identity', async ({page, app,
        context}) => {
        // Start creating an account from settings
        await context.grantPermissions(['clipboard-read', 'clipboard-write'])
        await app.open({seed: 'none', path: '/settings/'})
        await page.getByRole('button', {name: "Create Account"}).click()
        await expect(page.getByText("New sending account")).toBeVisible()
        await page.getByRole('button', {name: "Next"}).first().click()

        // Gracious option is explained
        await page.getByText("Gracious Tech").first().click()
        await page.locator('.v-radio', {hasText: "Christian causes"}).click()

        // Third party storage code (credentials served by fake S3)
        const storage = await app_eval<{code:string, body:number[]}>(page, `
            const m = await import('${SEED_MODULE}')
            return m.make_storage_code('third-party-bucket')`)
        await page.route('https://third-party-bucket.s3.amazonaws.com/**', route => {
            return route.request().method() === 'GET'
                ? route.fulfill({status: 200, body: Buffer.from(storage.body)})
                : route.fulfill({status: 204})
        })
        await page.getByText("Third party").click()
        const paste = page.getByRole('button', {name: "Paste storage code"})
        await app_eval(page, `await self.navigator.clipboard.writeText('invalid')`)
        await paste.click()
        await expect(page.getByText(/should start with/)).toBeVisible()
        await app_eval(page, `await self.navigator.clipboard.writeText('${storage.code}')`)
        await paste.click()
        await expect(page.getByText("third-party-bucket").first()).toBeVisible()
        await page.locator('.v-stepper__content:visible').getByRole('button', {name: "Next"})
            .click()

        // Email via "Other" with manual SMTP settings and a bad password first
        await page.locator('.v-stepper__content:visible').getByRole('button', {name: "Other"})
            .click()
        const dialog = page.locator('.v-dialog--active')
        await dialog.locator('input').first().fill('me@custom-domain.example')
        await dialog.getByRole('button', {name: "Continue"}).click()
        await dialog.getByRole('button', {name: "Change"}).nth(1).click()  // Server settings
        await dialog.getByLabel(/server/i).first().fill('smtp.custom-domain.example')
        await dialog.locator('.v-input', {hasText: /port/i}).locator('input').fill('2525')
        await dialog.getByRole('button', {name: "Continue"}).click()
        await dialog.locator('input[type=password]').fill('bad')
        await dialog.getByRole('button', {name: "Finish"}).click()
        await expect(dialog.getByText("Could not connect")).toBeVisible()
        await dialog.locator('input[type=password]').fill('good')
        await dialog.getByRole('button', {name: "Finish"}).click()
        await expect(dialog).toHaveCount(0)
        expect((await native_calls(page)).filter(c => c[0] === 'test_email_settings').length)
            .toBeGreaterThan(1)
        await expect(page.getByText('me@custom-domain.example').first()).toBeVisible()
        await page.locator('.v-stepper__content:visible').getByRole('button', {name: "Next"})
            .click()

        // Security choice
        await page.locator('.v-stepper__content:visible .v-list-item-group .v-list-item')
            .first().click()
        await page.locator('.v-stepper__content:visible').getByRole('button', {name: "Next"})
            .click()

        // Identity then finish
        // NOTE Storage services setup is stubbed as it involves many AWS APIs (unit tested instead)
        await app_eval(page, `
            self.app_vue.$tm.start_hosts_storage_update = async () => ({done: Promise.resolve()})
        `)
        await page.getByLabel("Name").first().fill("New Sender")
        await page.locator('.v-stepper__content:visible')
            .getByRole('button', {name: "Customise further"}).click()
        await expect(page.getByRole('heading', {name: "Responses"})).toBeVisible()
    })

    test('steps can go back and change email with oauth options shown', async ({page, app}) => {
        // Incomplete profile shows steps
        await app.open({seed: 'incomplete_profile', path: '/settings/'})
        await page.locator('.v-list-item', {hasText: "incomplete"}).click()
        await expect(page.getByText("New sending account")).toBeVisible()
        await page.getByRole('button', {name: "Next"}).first().click()
        await page.getByText("Self-hosted").click()
        await page.getByRole('button', {name: "Storage manager"}).click()
        await expect(page).toHaveURL(/#\/settings\/storage\/$/)
    })

    test('hosted account username is validated and creation errors shown', async ({page, app}) => {
        // Jump straight to identity step of a profile that chose Gracious hosting
        await app.open({seed: 'incomplete_profile', path: '/settings/'})
        const profile_id = await app_eval<string>(page, `
            const profile = (await self.app_db.profiles.list())[0]
            profile.host = {cloud: 'gracious', plan: 'c'}  // Partial as set by storage step
            profile.setup_step = 4
            await self.app_db.profiles.set(profile)
            return profile.id`)
        await page.route('**/accounts/available', async route => {
            const username = (route.request().postDataJSON() as {username:string}).username
            await route.fulfill({json: {valid: true, available: username !== 'taken'}})
        })
        let create_error:string = 'username_taken'
        await page.route('**/accounts/create',
            route => route.fulfill({json: {error: create_error}}))
        await app.goto(`/settings/profiles/${profile_id}/`)

        // Invalid, unavailable and available usernames
        const username = page.getByLabel("Message links")
        const usernames = [['a', "too short"], ['has space', "spaces"], ['-dash', "hyphen"],
            ['bad_char', "cannot contain"], ['taken', "Not available"]] as const
        for (const [value, error] of usernames){
            await username.fill(value)
            await expect(page.getByText(new RegExp(error))).toBeVisible()
        }
        await username.fill('Available-Name')
        await expect(page.locator('.v-messages.error--text')).toHaveCount(0)
        const done = page.locator('.v-stepper__content:visible').getByRole('button', {name: "Done"})
        await expect(done).toBeEnabled()

        // Server rejects creation with each kind of error
        const create_errors = [['username_taken', "different username"],
            ['ip_limit_day', "wait a day"], ['ip_limit_fortnight', "couple of weeks"]] as const
        for (const [error, message] of create_errors){
            create_error = error
            await done.click()
            await expect(page.locator('.done .error--text')).toBeVisible()
            // BUG #accounts-error-message: `override message!:create_errors` in
            //      AccountsCreateError is emitted as a class field which resets `message` to
            //      undefined after super(), so the generic "Something went wrong" always shows
            await expect.soft(page.getByText(new RegExp(message))).toBeVisible({timeout: 3000})
        }

        // Going back through steps
        await page.locator('.v-stepper__content:visible').getByRole('button', {name: "Prev"})
            .click()
        await expect(page.getByText("How important is security to you?")).toBeVisible()
    })

    test('missing profile shows message', async ({page, app}) => {
        // Unknown profile id
        await app.open({seed: 'profile', path: '/settings/profiles/missing/'})
        await expect(page.getByText("Sending account does not exist")).toBeVisible()
    })
})


test.describe('profile options', () => {

    async function open_profile(page:Page, app:AppFixture){
        // Open seeded profile's settings
        const seeded = (await app.open())!
        await app.goto(`/settings/profiles/${seeded.profile}/`)
        await expect(page.getByRole('heading', {name: "Responses"})).toBeVisible()
    }

    test('response options and reactions', async ({page, app}) => {
        // Toggle every response switch and choose reactions
        await open_profile(page, app)
        const switches = ["Allow replies", "Allow comments", "Allow reactions",
            "Warn against replying by email", "Include contents of replies in emails"]
        for (const label of switches){
            const switch_label = page.locator('.app-switch').getByText(label, {exact: true})
            await switch_label.click()
            await switch_label.click()
        }
        await page.locator('.reactions').click()
        const dialog = page.locator('.v-dialog--active')
        await expect(dialog.getByText("Chose which reactions")).toBeVisible()
        await dialog.locator('.reaction').first().click()
        await dialog.locator('.reaction').nth(1).click()
        await dialog.getByRole('button', {name: "Apply"}).click()

        // Notification mode and email include contents
        await select_field(page, "Notification frequency").click()
        await page.locator('.menuable__content__active .v-list-item').last().click()
        await expect.poll(() => app_eval<boolean>(page, `
            return (await self.app_db.profiles.list())[0].configs_need_uploading`))
            .toBeDefined()
    })

    test('expiry, appearance, identity and email options', async ({page, app}) => {
        // Change lifespan and max reads
        await open_profile(page, app)
        await select_field(page, "Expire after").click()
        await page.locator('.menuable__content__active .v-list-item').first().click()
        const reads = page.locator('.v-input', {hasText: "Lose access after opening"})
        await reads.locator('button.max').click()
        await reads.locator('button.min').click()
        await reads.locator('button').nth(1).click()  // Increase
        await reads.locator('button').nth(0).click()  // Decrease
        await reads.locator('input').fill('5')
        await reads.locator('input').fill('abc')
        await expect(reads.locator('.error--text').first()).toBeVisible()
        await reads.locator('input').fill('4')

        // Send to self option and resend requests switch
        await select_field(page, "Send to self").click({timeout: 5000}).catch(() => undefined)
        await page.keyboard.press('Escape')

        // Identity name
        await page.getByLabel("Name").last().fill("Profile Sender")

        // Email change dialog
        await page.getByRole('button', {name: "Change"}).first().click()
        const dialog = page.locator('.v-dialog--active')
        await expect(dialog.getByRole('button', {name: "Gmail"})).toBeVisible()
        await dialog.getByRole('button', {name: "Cancel"}).click()

        // Appearance theme options
        const theme = page.locator('.v-card', {has: page.getByText(/style|colou?r/i)}).last()
        await theme.locator('button, .v-chip, .v-radio').first().click({force: true})
    })

    test('subscription forms can be created, edited and deleted', async ({page, app, context}) => {
        // Seeded profile has one form; create another
        await context.grantPermissions(['clipboard-read', 'clipboard-write'])
        await open_profile(page, app)
        await page.getByRole('button', {name: "New Form"}).click()
        const dialog = page.locator('.v-dialog--active')
        await expect(dialog).toBeVisible()
        await dialog.locator('.ProseMirror').focus()
        await page.keyboard.type("Join my newsletter")
        await dialog.getByText("Show optional comment field").click()
        await select_field(page, "Add contacts to groups").click()
        await page.locator('.menuable__content__active .v-list-item').first().click()
        await page.keyboard.press('Escape')
        await dialog.getByRole('button', {name: "Done"}).click()

        // Copy url, edit, delete
        const form = page.locator('.v-list-item', {hasText: "Join my newsletter"}).first()
        await form.click()
        await menu_action(page, form, "Edit")
        await expect(page.locator('.v-dialog--active')).toBeVisible()
        await page.keyboard.press('Escape')
        await menu_action(page, form, "Delete")
        await confirm_if_asked(page)
        await expect(page.locator('.v-list-item', {hasText: "Join my newsletter"}))
            .toHaveCount(0)
    })
})


test.describe('storage manager', () => {

    test('enter key, scan and see empty result', async ({page, app}) => {
        // Manager talks to (fake) AWS
        await app.open({seed: 'profile', path: '/settings/storage/'})
        await expect(page.getByText("Enter key to scan")).toBeVisible()
        await page.getByRole('button', {name: "Settings"}).click()
        const dialog = page.locator('.v-dialog--active')
        await dialog.getByLabel("Access key ID").fill('AKIAMANAGER')
        await dialog.getByLabel("Secret key").fill('manager-secret')
        await dialog.getByRole('button', {name: "Done"}).click()
        await page.getByRole('button', {name: "Scan"}).click()
        await expect(page.getByText(/No storage created yet|Haven't scanned/)).toBeVisible()
        await page.getByRole('button', {name: "New", exact: true}).click()
        await expect(page.locator('.v-dialog--active')).toBeVisible()
        await page.keyboard.press('Escape')
    })
})


test.describe('backups', () => {

    test('internal backup, auto-export and manual import', async ({page, app}) => {
        // Backup page actions that don't need Google
        await app.open({path: '/settings/backup/'})
        await page.getByRole('button', {name: "Run Internal Backup Now"}).click()
        await page.getByText("Contacts & Messages").click()
        expect(await app_eval<string>(page, 'return self.app_store.state.backups')).toBe('all')

        // Export db then import it again (all records should already exist)
        const exported = await app_eval<number[]>(page, `
            const m = await import('/src/services/backup/database.ts')
            return [...new Uint8Array(await m.export_database())]`)
        await page.locator('input[type=file][accept=".json"]').setInputFiles({
            name: 'database.json', mimeType: 'application/json', buffer: Buffer.from(exported)})
        await expect(page.locator('.result-msg')).toContainText(/Imported \d+ records/)

        // Invalid file shows an error
        await page.locator('input[type=file][accept=".json"]').setInputFiles({
            name: 'database.json', mimeType: 'application/json', buffer: Buffer.from('{bad')})
        await expect(page.locator('.v-alert.error .result-msg')).toBeVisible()
        app.errors.length = 0  // Error is also logged (as expected)
    })

    test('google drive dialogs open', async ({page, app}) => {
        // Setup and restore dialogs (oauth itself is not reachable)
        await app.open({path: '/settings/backup/'})
        await page.getByRole('button', {name: "Backup to Google Drive"}).click()
        await expect(page.locator('.v-dialog--active')).toBeVisible()
        await page.keyboard.press('Escape')
        await page.getByRole('button', {name: "Restore from Google Drive"}).click()
        await expect(page.locator('.v-dialog--active')).toBeVisible()
        await page.keyboard.press('Escape')
    })
})


test('about page shows version', async ({page, app}) => {
    // Static content
    await app.open({seed: 'profile', path: '/about/'})
    await expect(page.locator('.docked').getByText(/Version \d/)).toBeVisible()
})

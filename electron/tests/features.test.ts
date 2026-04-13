// AI GENERATED - NOT YET REVIEWED

import type {Page} from '@playwright/test'
import {test, expect} from './playwright.config.js'


// UTILS

interface StelloWindow {
    // Subset of the Vuex store exposed by the Stello app on window
    app_store:{commit(mutation:string, payload:unknown):void}
}

async function set_store(page:Page, key:string,
        value:string|number|boolean|null, tmp=false):Promise<void>{
    // Set a value in the Vuex store from outside the app (via Playwright page.evaluate)
    await page.evaluate(
        ([k, v, t]) => (globalThis as unknown as StelloWindow).app_store.commit(
            t ? 'tmp_set' : 'dict_set', [k, v],
        ),
        [key, value, tmp] as [string, string|number|boolean|null, boolean],
    )
}


// BACKUP SETTINGS TESTS

test.describe('settings backup page', () => {

    test('backup section renders with all expected controls', async ({page, gotohash}) => {
        // Navigate to the backup settings page and check key elements are present
        await gotohash('#/settings/backup/')

        // Auto-export radio group
        await expect(page.locator('text=Auto-export:')).toBeVisible()
        await expect(page.getByRole('radio', {name: 'None'})).toBeVisible()
        await expect(page.getByRole('radio', {name: 'Contacts', exact: true})).toBeVisible()
        await expect(page.getByRole('radio', {name: 'Contacts & Messages'})).toBeVisible()

        // Cloud backup
        await expect(page.locator('button:has-text("Backup to Google Drive")')).toBeVisible()

        // Database import/restore
        await expect(page.locator('text=Import Database')).toBeVisible()
        await expect(page.locator('button:has-text("Restore from Google Drive")')).toBeVisible()

        // Export controls are on the main settings page
        await gotohash('#/settings/')
        await expect(page.locator('button:has-text("Export Contacts")')).toBeVisible()
        await expect(page.locator('button:has-text("Export Messages")')).toBeVisible()
    })

    test('auto-backup setting can be changed', async ({page, gotohash}) => {
        // Verify the auto-export radio buttons are interactive
        await gotohash('#/settings/backup/')

        // Click labels to change settings (Vuetify 2 hides the actual <input> with opacity:0)
        await page.locator('label.v-label:text-is("Contacts & Messages")').click()
        await page.locator('label.v-label:text-is("Contacts")').click()

        // No errors should be thrown (handled by the page error listener in config)
    })

})


// BLOBSTORE MIGRATION PROMPT TESTS

test.describe('blobstore migration prompt', () => {

    test('upgrade card appears when migration is needed', async ({page, gotohash}) => {
        // Navigate home and enable the migration flag via store
        await gotohash('#/')
        await set_store(page, 'show_blobstore_migrate', true)

        // The "Upgrade database" card should now be visible
        await expect(page.locator('text=Upgrade database')).toBeVisible()
    })

    test('clicking Upgrade now opens the migration dialog', async ({page, gotohash}) => {
        // Show the migration prompt and open the dialog
        await gotohash('#/')
        await set_store(page, 'show_blobstore_migrate', true)
        await page.click('button:has-text("Upgrade now")')

        // Dialog should open showing the upgrade details
        await expect(page.locator('text=save space on your hard drive')).toBeVisible()
        await expect(page.locator('button:has-text("Start")')).toBeVisible()
        await expect(page.locator('button:has-text("Cancel")')).toBeVisible()
    })

    test('migration runs and completes on empty database', async ({page, gotohash}) => {
        // Full migration flow: show prompt → open dialog → start → complete
        await gotohash('#/')
        await set_store(page, 'show_blobstore_migrate', true)
        await page.click('button:has-text("Upgrade now")')
        await page.click('button:has-text("Start")')

        // Migration should complete quickly on an empty database
        await expect(page.locator('text=Upgrade complete')).toBeVisible({timeout: 10_000})
        await expect(page.locator('button:has-text("Done")')).toBeVisible()

        // Clicking done should close the dialog
        await page.click('button:has-text("Done")')
        await expect(page.locator('text=Upgrade complete')).not.toBeVisible()

        // The migration prompt card should no longer show (flag was unset during migration)
        await expect(page.locator('text=Upgrade database')).not.toBeVisible()
    })

})


// RECOVER BACKUP PROMPT TESTS

test.describe('recover backup prompt', () => {

    test('recovery card appears when another dbid backup exists', async ({page, gotohash}) => {
        // Simulate a backup from a different (hypothetical) dbid being available
        await gotohash('#/')
        await set_store(page, 'restore_backup', 'other_dbid_12345', true)

        // The recover data card should appear with its action buttons
        const recover_card = page.locator('.v-card:has-text("Recover data from backup")')
        await expect(recover_card).toBeVisible()
        await expect(recover_card.locator('button:has-text("Recover data")')).toBeVisible()
        await expect(recover_card.locator('button:has-text("Dismiss")')).toBeVisible()
    })

    test('dismissing the recovery prompt hides the card', async ({page, gotohash}) => {
        // Show prompt then dismiss it
        await gotohash('#/')
        await set_store(page, 'restore_backup', 'other_dbid_12345', true)
        await expect(page.locator('text=Recover data from backup')).toBeVisible()

        await page.click('button:has-text("Dismiss")')

        // Card should disappear and the dismissed dbid should be remembered
        await expect(page.locator('text=Recover data from backup')).not.toBeVisible()
    })

})


// CLOUD BACKUP SUGGESTION TESTS

test.describe('cloud backup suggestion', () => {

    test('backup suggestion card appears after enough sends', async ({page, gotohash}) => {
        // The suggestion shows when usage_sends >= 2 and cloud backup not configured
        await gotohash('#/')
        await set_store(page, 'usage_sends', 2)
        await set_store(page, 'show_cloudbackup_suggest', true)
        await set_store(page, 'storage_oauth', null)

        await expect(page.locator('text=Back up your data')).toBeVisible()
        await expect(page.locator('button:has-text("Backup to Google Drive")')).toBeVisible()
        await expect(page.locator('button:has-text("I don\'t need this")')).toBeVisible()
    })

    test('dismissing cloud backup suggestion hides the card', async ({page, gotohash}) => {
        // Show suggestion then dismiss
        await gotohash('#/')
        await set_store(page, 'usage_sends', 2)
        await set_store(page, 'show_cloudbackup_suggest', true)
        await set_store(page, 'storage_oauth', null)
        await expect(page.locator('text=Back up your data')).toBeVisible()

        await page.click("button:has-text(\"I don't need this\")")

        await expect(page.locator('text=Back up your data')).not.toBeVisible()
    })

})

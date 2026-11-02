
// Integration tests against real Google and Microsoft accounts (contacts, email, Drive backup)
// Each issuer is skipped unless a test account's refresh token has been saved, see
// .bin/integration_oauth.mts (only ever use test accounts as their contacts are modified)

import {afterAll, beforeAll, describe, expect, test} from 'vitest'

import {setup_globals} from '@/../tests/unit_utils'
import {create_provider_oauth, provider_refresh_token, unique_name}
    from '@/../tests/integration_utils'
import {contacts_change_email, contacts_change_property, contacts_remove, contacts_sync,
    taskless_contacts_create} from './contacts'
import {cloudbackup_restore_direct, cloudbackup_sync, drive_wipe_all_google} from './cloudbackup'
import {Task} from './tasks'
import {new_email_task} from '../email/email'
import type {Database} from '../database/database'
import type {OAuth} from '../database/oauths'


// Run tests for each issuer that has a test account
// NOTE Contacts sync is only offered for Google (Microsoft's import option is disabled)
describe.each(['google', 'microsoft'] as const)('%s account', issuer => {

    // Whether to test contacts for this issuer
    const test_contacts = test.skipIf(!provider_refresh_token(issuer) || issuer !== 'google')

    const name = unique_name()
    let db:Database
    let oauth:OAuth
    let contact_id:string|undefined

    // Sync contacts from the account into the app's database
    async function sync(){
        await contacts_sync(new Task('contacts_sync', [oauth.id], []))
        return (await db.contacts.list()).filter(c => c.service_account === oauth.service_account)
    }

    beforeAll(async () => {
        // Skip all tests for this issuer if no test account available
        if (!provider_refresh_token(issuer)){
            return
        }
        ;({db} = await setup_globals())
        oauth = await create_provider_oauth(db, issuer)
    })

    afterAll(async () => {
        // Remove test contact if a test failed before removing it
        if (contact_id && await db.contacts.get(contact_id)){
            await contacts_remove(new Task('contacts_remove', [contact_id], []))
        }
    })

    // Contacts created in the app appear in the account and sync back
    test_contacts('contact can be created and synced', async () => {
        const contact = await taskless_contacts_create(oauth, name, `${name}@example.com`)
        contact_id = contact.id
        expect(contact.service_id).toBeTruthy()

        // Access token was expired, so the app must have refreshed it
        expect((await db.oauths.get(oauth.id))!.token_access_expires!.getTime())
            .toBeGreaterThan(Date.now())

        // Sync replaces local record with what's in the account
        const synced = await sync()
        expect(synced.map(c => [c.name, c.address])).toContainEqual(
            [name, `${name}@example.com`])
    })

    // Changes made in the app are saved to the account
    test_contacts('contact can be changed', async () => {
        const contact = (await sync()).find(c => c.name === name)!
        contact_id = contact.id
        await contacts_change_property(new Task('contacts_change_property',
            [oauth.id, contact.id, 'name'], [`${name} renamed`]))
        await contacts_change_email(new Task('contacts_change_email', [oauth.id, contact.id],
            [[`${name}@example.com`, `${name}-new@example.com`], `${name}-new@example.com`]))
        const synced = (await sync()).find(c => c.service_id === contact.service_id)!
        contact_id = synced.id
        expect([synced.name, synced.address]).toEqual(
            [`${name} renamed`, `${name}-new@example.com`])
    })

    // Contacts removed in the app are removed from the account
    test_contacts('contact can be removed', async () => {
        const contact = (await sync()).find(c => c.name === `${name} renamed`)!
        await contacts_remove(new Task('contacts_remove', [contact.id], []))
        contact_id = undefined
        expect((await sync()).map(c => c.service_id)).not.toContain(contact.service_id)
    })

    // Emails send via the account's API (to itself)
    test.skipIf(!provider_refresh_token(issuer))('email can be sent', async () => {
        const profile = await db.profiles.create()
        profile.email = oauth.email
        profile.smtp.oauth = oauth.id
        await db.profiles.set(profile)
        const email_task = new_email_task(await profile.get_authed_smtp_settings())
        const accepted = await email_task.send({
            id: name,
            to: {name: "Integration Test", address: oauth.email},
            from: {name: "Stello Integration", address: oauth.email},
            subject: `Stello integration test (${issuer}) ✓`,
            html: `<p>Sent by Stello's integration tests ✓ ${'long line '.repeat(200)}</p>`,
        })
        expect(accepted).toBe(true)
    })
})


describe('google drive backup', () => {

    const password = 'integration test password'
    let oauth:OAuth|undefined

    afterAll(async () => {
        // Remove all of the app's backup data from the account
        if (oauth){
            await drive_wipe_all_google(oauth)
        }
    })

    // Backup uploads to Drive and can be restored into a new installation
    test.skipIf(!provider_refresh_token('google'))('backup can be restored', async () => {
        const {db, store, native} = await setup_globals({cloudbackup: 'all'})
        oauth = await create_provider_oauth(db, 'google')
        store.state.storage_oauth = oauth.id
        await db.contacts.create({name: "Backed up contact", address: 'backup@example.com'})
        native.files.set('Internal Files/file.txt', new TextEncoder().encode("internal").buffer)
        await cloudbackup_sync(new Task('cloudbackup_sync', [], [password]))

        // New installation (different database id) restores with the password
        const fresh = await setup_globals({dbid: 'restored_dbid'})
        // NOTE Replaces oauth used for cleanup since globals (incl. token encryption) changed
        oauth = await create_provider_oauth(fresh.db, 'google')
        const result = await cloudbackup_restore_direct(oauth.id, password)
        expect(result.added).toBeGreaterThan(0)
        expect((await fresh.db.contacts.list()).map(c => c.name))
            .toContain("Backed up contact")
    })
})

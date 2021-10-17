/* eslint-disable @typescript-eslint/no-explicit-any -- needed when prop no longer exists */

import 'fake-indexeddb/auto'  // WARN Must import before indexeddb accessed
import {expect, test} from '@playwright/test'

import {migrate, migrate_async, DATABASE_VERSION, to_12_from_0, _to1_creates, to_13}
    from './migrations'
import {STORES_V12, STORES_LATEST, test_stores, open_db, to_12_from_1, to_12_from_11}
    from './migrations.test_utils'


test.describe('migrate', async () => {

    test('new', async () => {
        // Test database setup without any previous version (skips 1-12 aside from stores/indexes)
        const db = await open_db('new', DATABASE_VERSION, migrate, migrate_async)
        await test_stores(db, STORES_LATEST)
    })

    test('alt_route', async () => {
        // Confirm can use migrate/migrate_async fns via the alt route used for v1-11

        // Do initial migration to version 1 to trigger the alt route
        let db = await open_db('alt_route', 1, _to1_creates)
        db.close()

        // Proceed normally and test stores correct
        db = await open_db('alt_route', DATABASE_VERSION, migrate, migrate_async)
        await test_stores(db, STORES_LATEST)
    })

    test('to_12_from_0', async () => {
        // Test the to_12 migration step from 0 (not used when migrating from 1-11)
        const db = await open_db('to_12_from_0', 12, to_12_from_0)
        await test_stores(db, STORES_V12)
    })

    test('to_12_from_1', to_12_from_1)

    test('to_12_from_11', to_12_from_11)

    test('to_13', async () => {

        // Setup
        let db = await open_db('to_13', 12, to_12_from_0)
        await db.put('state', {key: 'manager_aws_key_secret', value: 'value'})
        await db.put('profiles', {id: 'incomplete', setup_step: 3} as any)
        await db.put('profiles', {id: 'complete', setup_step: null, options: {}} as any)

        // Confirm setup correct
        expect(await db.get('state', 'manager_aws_key_secret')).not.toBe(undefined)
        expect(await db.get('profiles', 'incomplete')).not.toBe(undefined)
        expect(await db.get('profiles', 'complete')).not.toBe(undefined)

        // Migrate
        db.close()
        db = await open_db('to_13', 13, to_13)

        // manager_aws_key_secret has been deleted
        expect(await db.get('state', 'manager_aws_key_secret')).toBe(undefined)

        // Incomplete profiles have been deleted
        expect(await db.get('profiles', 'incomplete')).toBe(undefined)

        // Complete profiles have generic_domain option added, and revert to incomplete setup
        const complete_profile = await db.get('profiles', 'complete')
        expect(complete_profile!.options.generic_domain).toBe(true)
        expect(complete_profile!.setup_step).toBe(0)
    })

})

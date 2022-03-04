/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access,
    @typescript-eslint/no-unsafe-argument -- needed when prop no longer exists */

import 'fake-indexeddb/auto'  // WARN Must import before indexeddb accessed
import {expect, test} from '@playwright/test'

import {migrate, migrate_async, DATABASE_VERSION, to_12_from_0, _to1_creates, to_13, to_14,
    to_14_async, to_15, to_16} from './migrations'
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

    test('to_14', async () => {

        // Setup
        let db = await open_db('to_14', 13, async t => {
            await to_12_from_0(t)
            await to_13(t)
        })
        await db.put('profiles', {id: 'gracious', host: {cloud: 'gracious'}, smtp: {}} as any)
        await db.put('profiles', {id: 'aws', host: {cloud: 'aws'}, smtp: {}} as any)
        await db.put('profiles', {id: 'pass', smtp: {pass: 'pass'}} as any)
        await db.put('profiles', {id: 'nopass', smtp: {pass: ''}} as any)
        await db.put('oauths', {id: 'id', token_access: 'access', token_refresh: 'refresh'} as any)

        // Migrate
        db.close()
        db = await open_db('to_14', 14, to_14, to_14_async)

        // Plan property added to gracious hosts
        expect((await db.get('profiles', 'gracious') as any).host.plan).toEqual('c')
        expect((await db.get('profiles', 'aws') as any).host.plan).toBeUndefined()

        // Expect pass to be encrypted (or null if empty string)
        expect((await db.get('profiles', 'pass'))!.smtp.pass).toBeInstanceOf(ArrayBuffer)
        expect((await db.get('profiles', 'nopass'))!.smtp.pass).toBeNull()

        // Expect tokens to be encrypted
        expect((await db.get('oauths', 'id'))!.token_access).toBeInstanceOf(ArrayBuffer)
        expect((await db.get('oauths', 'id'))!.token_refresh).toBeInstanceOf(ArrayBuffer)
    })

    test('to_15', async () => {

        // Setup
        let db = await open_db('to_15', 14, async t => {
            await to_12_from_0(t)
            await to_13(t)
            await to_14(t)
        })
        await db.put('profiles', {id: 'id', host: null, setup_step: null} as any)
        expect((await db.get('profiles', 'id'))).not.toBeUndefined()

        // Migrate
        db.close()
        db = await open_db('to_15', 15, to_15)

        // Expect corrupted profiles to be deleted
        expect((await db.get('profiles', 'id'))).toBeUndefined()
    })

    test('to_16', async () => {

        // Setup
        let db = await open_db('to_16', 15, async t => {
            await to_12_from_0(t)
            await to_13(t)
            await to_14(t)
            await to_15(t)
        })
        await db.put('profiles', {id: 'old', host_state: {disp_config_name: 'a'}} as any)
        await db.put('profiles', {id: 'new', host_state: {}} as any)
        for (const store of ['replies', 'reactions'] as ('replies'|'reactions')[]){
            await db.put(store, {id: 'id', section_num: 1, section_type: 'text'} as any)
            const record = await db.get(store, 'id')
            expect(record).toHaveProperty('section_num')
            expect(record).toHaveProperty('section_type')
        }

        // Migrate
        db.close()
        db = await open_db('to_16', 16, to_16)

        // Expect old beta profiles to have been removed
        expect(await db.get('profiles', 'old')).toBeUndefined()
        expect(await db.get('profiles', 'new')).toBeDefined()

        // Expect section_num/section_type properties to have been removed
        for (const store of ['replies', 'reactions'] as ('replies'|'reactions')[]){
            const record = await db.get(store, 'id')
            expect(record).not.toHaveProperty('section_num')
            expect(record).not.toHaveProperty('section_type')
        }
    })

})

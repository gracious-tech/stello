
import {afterEach, describe, expect, test, vi} from 'vitest'

import {database} from './database'


// NOTE Separate file so that no other connections to the db exist yet
describe('database fallback', () => {

    afterEach(() => {
        vi.restoreAllMocks()
    })

    // Fallback when opening fails asynchronously (e.g. version error, Firefox private mode)
    test('falls back to non-persistent fake when opening db fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        // Create a newer version of the db so that connecting to v1 fails with a VersionError
        await new Promise<void>(resolve => {
            const request = indexedDB.open('stello', 2)
            request.onsuccess = () => {
                request.result.close()
                resolve()
            }
        })
        await database.connect()
        await database.dict_set('a', 1)
        expect(await database.dict_get('a')).toBe(null)
        expect(await database.dict_get_all()).toEqual({})
        expect(await database.message_get_all()).toEqual([])
        expect(await database.reaction_get('x')).toBe(null)
        await database.reaction_set('m', 's', null, 'like')
        await database.reaction_remove('s')
        expect(await database.reply_list('m', null, null)).toEqual([])
        await database.reply_add('m', null, null)
    })

    // Fallback when opening throws synchronously (e.g. Safari's invalid security context)
    test('falls back to non-persistent fake when indexedDB.open throws', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        vi.spyOn(indexedDB, 'open').mockImplementation(() => {
            throw new Error("IDBFactory.open() called in an invalid security context")
        })
        // openDB() can throw synchronously, which must still use the fallback
        await expect(database.connect()).resolves.toBe(undefined)
    })
})

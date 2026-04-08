// AI GENERATED - NOT YET REVIEWED

import {expect, test} from '@playwright/test'

import {NativeBrowser} from '../native/native_browser'
import {get_backups_dir, determine_backup_dir, find_other_backup_dbids} from './backup_dirs'


// GLOBAL MOCKS

global.self = global as Window & typeof globalThis
self.app_native = new NativeBrowser()
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- minimal stub
self.app_store = {state: {dbid: 'test_dbid_abc'}} as typeof self.app_store


// UTILS

const TEST_DBID = 'test_dbid_abc'
const ms_per_day = 1000 * 60 * 60 * 24

function days_ago(n:number):string{
    // Get a UTC date string for n days in the past
    return new Date(Date.now() - n * ms_per_day).toISOString().slice(0, 10)
}

function mock_file_list(responses:Record<string, string[]>){
    // Replace user_file_list with a mock that returns pre-set directory listings
    self.app_native.user_file_list = async (path:string) => responses[path] ?? []
}


// GET_BACKUPS_DIR TESTS

test.describe('get_backups_dir', () => {

    test('returns dir name containing the current dbid', () => {
        const result = get_backups_dir()
        expect(result).toBe(`Backups [${TEST_DBID}]`)
    })

})


// DETERMINE_BACKUP_DIR TESTS

test.describe('determine_backup_dir', () => {

    test('returns [null, null] if already backed up today', async () => {
        const today = new Date().toISOString().slice(0, 10)
        mock_file_list({
            [`Backups [${TEST_DBID}]/database`]: [today],
        })

        const result = await determine_backup_dir('database')

        expect(result).toEqual([null, null])
    })

    test('returns [new_path, null] when no previous backups exist', async () => {
        mock_file_list({
            [`Backups [${TEST_DBID}]/database`]: [],
        })
        const today = new Date().toISOString().slice(0, 10)

        const [new_path, remove_path] = await determine_backup_dir('database')

        expect(new_path).toBe(`Backups [${TEST_DBID}]/database/${today}`)
        expect(remove_path).toBeNull()
    })

    test('returns [new_path, null] when only 1 previous backup exists', async () => {
        mock_file_list({
            [`Backups [${TEST_DBID}]/database`]: [days_ago(10)],
        })

        const [new_path, remove_path] = await determine_backup_dir('database')

        expect(new_path).toBeTruthy()
        expect(remove_path).toBeNull()
    })

    test('returns [new_path, null] when only 2 previous backups exist', async () => {
        mock_file_list({
            [`Backups [${TEST_DBID}]/database`]: [days_ago(20), days_ago(5)],
        })

        const [new_path, remove_path] = await determine_backup_dir('database')

        expect(new_path).toBeTruthy()
        expect(remove_path).toBeNull()
    })

    test('deletes oldest when 3 backups and second oldest is over 30 days ago', async () => {
        // backups[1] is 40 days ago — well over 30 days, so oldest (60 days) can be removed
        const oldest = days_ago(60)
        const second_oldest = days_ago(40)
        const newest = days_ago(5)
        mock_file_list({
            [`Backups [${TEST_DBID}]/database`]: [oldest, second_oldest, newest],
        })
        const backups_dir = `Backups [${TEST_DBID}]`

        const [new_path, remove_path] = await determine_backup_dir('database')

        expect(new_path).toBeTruthy()
        expect(remove_path).toBe(`${backups_dir}/database/${oldest}`)
    })

    test('deletes newest when 3 backups and second oldest is under 30 days ago', async () => {
        // backups[1] is 15 days ago — under 30 days, so we keep oldest and delete newest
        const oldest = days_ago(60)
        const second_oldest = days_ago(15)
        const newest = days_ago(5)
        mock_file_list({
            [`Backups [${TEST_DBID}]/database`]: [oldest, second_oldest, newest],
        })
        const backups_dir = `Backups [${TEST_DBID}]`

        const [new_path, remove_path] = await determine_backup_dir('database')

        expect(new_path).toBeTruthy()
        expect(remove_path).toBe(`${backups_dir}/database/${newest}`)
    })

    test('non-date filenames in the directory are ignored', async () => {
        // Only 'notes.txt' is present — not a valid date — so treated as 0 backups
        mock_file_list({
            [`Backups [${TEST_DBID}]/database`]: ['notes.txt', 'README'],
        })

        const [new_path, remove_path] = await determine_backup_dir('database')

        expect(new_path).toBeTruthy()
        expect(remove_path).toBeNull()
    })

    test('uses correct category subdirectory', async () => {
        mock_file_list({
            [`Backups [${TEST_DBID}]/messages`]: [],
        })
        const today = new Date().toISOString().slice(0, 10)

        const [new_path] = await determine_backup_dir('messages')

        expect(new_path).toBe(`Backups [${TEST_DBID}]/messages/${today}`)
    })

})


// FIND_OTHER_BACKUP_DBIDS TESTS

test.describe('find_other_backup_dbids', () => {

    test('returns empty array when no backup dirs exist', async () => {
        mock_file_list({'': []})

        const result = await find_other_backup_dbids(TEST_DBID)

        expect(result).toEqual([])
    })

    test('excludes the current dbid', async () => {
        mock_file_list({
            '': [`Backups [${TEST_DBID}]`],
            [`Backups [${TEST_DBID}]`]: ['database.json'],
        })

        const result = await find_other_backup_dbids(TEST_DBID)

        expect(result).toEqual([])
    })

    test('excludes backup dirs without database.json', async () => {
        mock_file_list({
            '': ['Backups [other_dbid]'],
            'Backups [other_dbid]': ['contacts.csv'],  // No database.json
        })

        const result = await find_other_backup_dbids(TEST_DBID)

        expect(result).toEqual([])
    })

    test('includes other dbid when database.json is present', async () => {
        mock_file_list({
            '': ['Backups [other_dbid]'],
            'Backups [other_dbid]': ['database.json', 'contacts.csv'],
        })

        const result = await find_other_backup_dbids(TEST_DBID)

        expect(result).toEqual(['other_dbid'])
    })

    test('returns multiple other dbids', async () => {
        mock_file_list({
            '': ['Backups [dbid_1]', 'Backups [dbid_2]', `Backups [${TEST_DBID}]`],
            'Backups [dbid_1]': ['database.json'],
            'Backups [dbid_2]': ['database.json'],
            [`Backups [${TEST_DBID}]`]: ['database.json'],
        })

        const result = await find_other_backup_dbids(TEST_DBID)

        expect(result).toHaveLength(2)
        expect(result).toContain('dbid_1')
        expect(result).toContain('dbid_2')
    })

    test('ignores non-backup directory names', async () => {
        mock_file_list({
            '': ['Internal Files', 'Exports', 'some_random_dir'],
        })

        const result = await find_other_backup_dbids(TEST_DBID)

        expect(result).toEqual([])
    })

})

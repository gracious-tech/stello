
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {setup_globals, json_response, MemoryNative, MockStore} from '@/../tests/unit_utils'
import {Database} from '../database/database'
import {OAuth} from '../database/oauths'
import {Task, TaskAborted} from './tasks'
import * as oauth_module from './oauth'
import {cloudbackup_size_estimates, storage_oauth_setup, cloudbackup_sync,
    cloudbackup_restore_direct, get_backup_dbid, drive_wipe_all_google} from './cloudbackup'
import {MustInterpret, MustMakeSpace, MustReauthenticate, MustRecover, MustWait}
    from '../utils/exceptions'
import {string_to_utf8} from '../utils/coding'


let db:Database
let native:MemoryNative
let store:MockStore
let oauth:OAuth

// Fake Drive appDataFolder
let drive:Map<string, {name:string, data:Uint8Array}>
let drive_counter:number
let fail_uploads_of:string|null
let error_status:number|null
let error_body:unknown

beforeEach(async () => {
    ({db, native, store} = await setup_globals({dbid: 'db1', cloudbackup: 'all'}))
    await db.state.set({key: 'dbid', value: 'db1'})
    oauth = await db.oauths.create({issuer: 'google', issuer_id: 'g', email: 'a@gmail.com',
        scope_sets: ['storage']} as OAuth)
    store.state.storage_oauth = oauth.id
    drive = new Map()
    drive_counter = 0
    fail_uploads_of = null
    error_status = null
    error_body = {}

    vi.spyOn(oauth_module, 'oauth_request').mockImplementation(
        async (_oauth, url, params, method='GET', body) => {
            const path = url.replace('https://www.googleapis.com/', '')
            if (error_status){
                return json_response(error_body, error_status)
            }
            if (path === 'drive/v3/files' && method === 'GET'){
                let files = [...drive.entries()].map(([id, f]) => ({id, name: f.name}))
                const q = params?.['q'] as string|undefined
                if (q){
                    files = files.filter(f => q.includes(`'${f.name}'`))
                }
                return json_response({files})
            }
            if (path === 'upload/drive/v3/files' && method === 'POST'){
                const {name, data} = parse_multipart(new Uint8Array(
                    await (body as Blob).arrayBuffer()))
                if (name === fail_uploads_of){
                    return json_response({}, 500)
                }
                const id = `id${drive_counter++}`
                drive.set(id, {name, data})
                return json_response({id})
            }
            const id = path.split('/').at(-1)!
            if (method === 'DELETE'){
                return drive.delete(id) ? new Response(null, {status: 204})
                    : json_response({}, 404)
            }
            if (method === 'GET' && drive.has(id)){
                return new Response(drive.get(id)!.data as BodyInit)
            }
            return json_response({}, 404)
        })
})

afterEach(() => {
    vi.restoreAllMocks()
})


function parse_multipart(bytes:Uint8Array){
    // Extract metadata name and binary data from multipart upload body
    const text = new TextDecoder('latin1').decode(bytes)
    const data_header = '\r\n--stello_backup_boundary\r\nContent-Type: application/octet-stream'
        + '\r\n\r\n'
    const meta_start = text.indexOf('\r\n\r\n') + 4
    const data_header_index = text.indexOf(data_header)
    const meta = JSON.parse(text.slice(meta_start, data_header_index)) as {name:string}
    const data_start = data_header_index + data_header.length
    const data_end = bytes.length - '\r\n--stello_backup_boundary--'.length
    return {name: meta.name, data: bytes.slice(data_start, data_end)}
}

const drive_names = () => [...drive.values()].map(f => f.name).sort()
const sync = (password?:string) => cloudbackup_sync(
    new Task('cloudbackup_sync', [], password === undefined ? [] : [password]))


describe('cloudbackup_size_estimates', () => {

    test('includes internal files size', async () => {
        native.files.set('Internal Files/a', new ArrayBuffer(2_500_000))
        expect(await cloudbackup_size_estimates()).toEqual({database: '~5 MB', all: '~8 MB'})
    })
})


describe('storage_oauth_setup', () => {

    test('requires storage scope', async () => {
        store.state.storage_oauth = null
        await storage_oauth_setup(new Task('', [oauth.id], []))
        expect(store.state.storage_oauth).toBe(oauth.id)
        const no_scope = await db.oauths.create({issuer: 'google', issuer_id: 'x',
            scope_sets: []} as unknown as OAuth)
        await expect(storage_oauth_setup(new Task('', [no_scope.id], [])))
            .rejects.toThrow('permission was not granted')
        await expect(storage_oauth_setup(new Task('', ['missing'], [])))
            .rejects.toBeInstanceOf(TaskAborted)
    })
})


describe('cloudbackup_sync', () => {

    test('fresh backup uploads meta, database and files', async () => {
        native.files.set('Internal Files/a.png', string_to_utf8('aaa'))
        native.files.set('Internal Files/b.pdf', string_to_utf8('bbb'))
        await sync('password')
        expect(drive_names()).toEqual(['backup_database.json', 'backup_files_a.png',
            'backup_files_b.pdf', 'backup_meta.json'])
        expect(store.state.cloudbackup_key).not.toBe(null)
        expect(store.state.cloudbackup_last).toBeInstanceOf(Date)
        expect(native.files.has('Backups [db1]/database.json')).toBe(true)
    })

    test('subsequent sync only uploads new files and deletes removed ones', async () => {
        native.files.set('Internal Files/a.png', string_to_utf8('aaa'))
        native.files.set('Internal Files/b.pdf', string_to_utf8('bbb'))
        await sync('password')
        const uploads_before = drive_counter
        native.files.delete('Internal Files/a.png')
        native.files.set('Internal Files/c.jpg', string_to_utf8('ccc'))
        await sync()
        expect(drive_names()).toEqual(['backup_database.json', 'backup_files_b.pdf',
            'backup_files_c.jpg', 'backup_meta.json'])
        expect(drive_counter - uploads_before).toBe(2)  // Database + c.jpg
    })

    test('database-only level removes previously backed up files', async () => {
        native.files.set('Internal Files/a.png', string_to_utf8('aaa'))
        await sync('password')
        store.state.cloudbackup = 'database'
        await sync()
        expect(drive_names()).toEqual(['backup_database.json', 'backup_meta.json'])
    })

    test('fresh backup wipes existing drive files', async () => {
        drive.set('old', {name: 'backup_files_old', data: new Uint8Array()})
        await sync('password')
        expect(drive.has('old')).toBe(false)
    })

    test('aborts when backup belongs to different database', async () => {
        await sync('password')
        store.state.dbid = 'other'
        await expect(sync()).rejects.toThrow('different database')
    })

    test('aborts when no storage oauth', async () => {
        store.state.storage_oauth = null
        await expect(sync()).rejects.toBeInstanceOf(TaskAborted)
    })

    test('missing local file fails the sync', async () => {
        await sync('password')
        native.user_file_list = async () => ['ghost.png']
        await expect(sync()).rejects.toThrow('Blob file not found')
    })

    test('failed upload of database keeps previous database backup', async () => {
        // BUG #cloudbackup-delete-first: old backup_database.json is deleted before the new
        //      one is uploaded, so a failed upload leaves no database backup on Drive at all
        await sync('password')
        fail_uploads_of = 'backup_database.json'
        await expect(sync()).rejects.toBeInstanceOf(MustWait)
        expect(drive_names()).toContain('backup_database.json')
    })
})


describe('cloudbackup_restore_direct', () => {

    test('restores database and files with correct password', async () => {
        native.files.set('Internal Files/a.png', string_to_utf8('aaa'))
        await db.contacts.create({name: 'Restored'})
        await sync('secret')

        // Simulate new installation
        const fresh = await setup_globals({dbid: 'db2'})
        await fresh.db.oauths.set(oauth)
        const result = await cloudbackup_restore_direct(oauth.id, 'secret')
        expect(result.added).toBeGreaterThan(0)
        expect((await fresh.db.contacts.list()).map(c => c.name)).toEqual(['Restored'])
        expect(new TextDecoder().decode(fresh.native.files.get('Internal Files/a.png')))
            .toBe('aaa')
    })

    test('errors for wrong password, same db, missing files', async () => {
        await sync('secret')
        await expect(cloudbackup_restore_direct(oauth.id, 'secret')).rejects.toThrow(
            'from this database')
        store.state.dbid = 'db2'
        await expect(cloudbackup_restore_direct(oauth.id, 'wrong')).rejects.toThrow(
            'Incorrect password')
        await expect(cloudbackup_restore_direct('missing', 'x')).rejects.toThrow('No longer')
        for (const [id, file] of drive){
            if (file.name === 'backup_database.json'){
                drive.delete(id)
            }
        }
        await expect(cloudbackup_restore_direct(oauth.id, 'secret')).rejects.toThrow(
            'No database backup')
        drive.clear()
        await expect(cloudbackup_restore_direct(oauth.id, 'secret')).rejects.toThrow(
            'No backup metadata')
    })
})


describe('drive helpers', () => {

    test('get_backup_dbid and wipe', async () => {
        expect(await get_backup_dbid(oauth)).toBe(null)
        await sync('pw')
        expect(await get_backup_dbid(oauth)).toBe('db1')
        await drive_wipe_all_google(oauth)
        expect(drive.size).toBe(0)
    })

    test('maps drive error statuses', async () => {
        const cases:[number, unknown, unknown][] = [
            [401, {}, MustReauthenticate],
            [403, {error: {errors: [{reason: 'storageQuotaExceeded'}]}}, MustMakeSpace],
            [403, {}, MustReauthenticate],
            [404, {}, MustRecover],
            [429, {}, MustWait],
            [500, {}, MustWait],
            [400, {}, MustInterpret],
        ]
        for (const [status, body, error_class] of cases){
            error_status = status
            error_body = body
            await expect(get_backup_dbid(oauth)).rejects.toBeInstanceOf(error_class)
        }
    })
})

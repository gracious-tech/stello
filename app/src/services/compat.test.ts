// Compatibility tests: backups and responses stored by every past version must still be readable
// See fixtures/compat/README.md

import {existsSync, readdirSync, readFileSync} from 'fs'
import path from 'path'

import {afterEach, describe, expect, test, vi} from 'vitest'

import app_config from '@/app_config.json'
import {setup_globals} from '@/../tests/unit_utils'
import {import_database} from './backup/database'
import {responses_receive} from './tasks/responses'
import {Task} from './tasks/tasks'
import {string_to_utf8, url64_to_buffer, utf8_to_string} from './utils/coding'
import {decrypt_sym, export_key, import_key_sym} from './utils/crypt'
import type {HostUser} from './hosts/types'
import type {PublishedCopy} from '@/shared/shared_types'


const COMPAT_DIR = path.resolve(import.meta.dirname, '../../../fixtures/compat')


function versions_with(...fixtures:string[]):string[]{
    // Versions (oldest first) that have all the given fixture files
    const versions = existsSync(COMPAT_DIR) ? readdirSync(COMPAT_DIR) : []
    return versions.filter(v => fixtures.every(f => existsSync(path.join(COMPAT_DIR, v, f))))
        .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}))
}


function read_fixture<T>(version:string, fixture:string):T{
    // Read a fixture file for the given version
    return JSON.parse(readFileSync(path.join(COMPAT_DIR, version, fixture), 'utf8')) as T
}


// Parts of the fixtures these tests use
interface AppFixture {
    ids:{profile:string, msg:string, copy:string, contact:string, form:string,
        sections:Record<string, string>}
    storage:Record<string, string>
    backup:string
}
interface ResponderFixture {
    objects:Record<string, string>
}


afterEach(() => {
    vi.restoreAllMocks()
})


// Fail if fixtures are ever missing (rather than silently testing nothing)
// NOTE Release script generates them for each new version (see .bin/generate_compat)
test('fixtures exist for current version', () => {
    expect(versions_with('app.json', 'displayer.json', 'responder.json'))
        .toContain(`v${app_config.version}`)
})


describe.each(versions_with('app.json', 'responder.json'))('data stored by %s', version => {

    const app = read_fixture<AppFixture>(version, 'app.json')
    const responder = read_fixture<ResponderFixture>(version, 'responder.json')

    // Restore the version's backup into a fresh database (as a user restoring a backup would)
    async function restore(){
        const {db} = await setup_globals()
        const result = await import_database(string_to_utf8(app.backup))
        return {db, result}
    }

    // Backup restores all records, including keys that still work
    test('backup can be restored', async () => {
        const {db, result} = await restore()
        expect(result.skipped).toBe(0)
        expect(await db.profiles.get(app.ids.profile)).toBeDefined()
        expect(await db.contacts.get(app.ids.contact)).toBeDefined()
        expect(await db.subscribe_forms.get(app.ids.form)).toBeDefined()
        expect((await db.messages.get(app.ids.msg))?.draft.title).toBe("Compat message")

        // Restored copy secret can still decrypt the copy that was uploaded
        const copy = (await db.copies.get(app.ids.copy))!
        const key = await import_key_sym(await export_key(copy.secret))
        const decrypted = await decrypt_sym(url64_to_buffer(app.storage[`copies/${copy.id}`]!),
            key)
        expect((JSON.parse(utf8_to_string(decrypted)) as PublishedCopy).title)
            .toBe("Compat message")
    })

    // Every type of response stored by that version's responder is processed
    test('responses can be received', async () => {
        const {db} = await restore()
        const objects = new Map(Object.entries(responder.objects))
        vi.spyOn(db, 'new_host_user').mockImplementation(async () => ({
            list_responses: async () => [...objects.keys()],
            download_response: async (key:string) => string_to_utf8(objects.get(key)!),
            delete_response: async (key:string) => {
                objects.delete(key)
            },
        } as unknown as HostUser))

        await responses_receive(new Task('responses_receive', [], []))
        expect([...objects.keys()]).toEqual([])  // All processed and deleted

        expect(await db.reads.list_for_msg(app.ids.msg)).toHaveLength(1)
        const replies = await db.replies.list()
        expect(replies.map(r => [r.content, r.section_id, r.contact_id])).toEqual(
            [["Compat reply", app.ids.sections['text'], app.ids.contact]])
        const reactions = await db.reactions.list()
        expect(reactions.map(r => [r.content, r.section_id, r.subsection_id])).toEqual(
            [['like', app.ids.sections['images'], 'img1']])
        const unsubscribes = await db.unsubscribes.list()
        expect(unsubscribes.map(u => [u.profile, u.contact])).toEqual(
            [[app.ids.profile, app.ids.contact]])
        expect((await db._conn.getAll('request_address')).map(r => r.new_address))
            .toEqual(['new@example.com'])
        expect((await db._conn.getAll('request_resend')).map(r => r.reason))
            .toEqual(["Compat resend reason"])
        expect((await db._conn.getAll('request_subscribe')).map(r => [r.address, r.name]))
            .toEqual([['subscriber@example.com', "Compat Subscriber"]])
    })
})

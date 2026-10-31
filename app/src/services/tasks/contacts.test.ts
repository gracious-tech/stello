
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {setup_globals, json_response, MockStore} from '@/../tests/unit_utils'
import {Database} from '../database/database'
import {OAuth} from '../database/oauths'
import {Task, TaskAborted} from './tasks'
import * as oauth_module from './oauth'
import {contacts_oauth_setup, contacts_sync, contacts_change_property, contacts_change_email,
    contacts_remove, contacts_create, contacts_group_create, contacts_group_remove,
    contacts_group_name, contacts_group_fill, contacts_group_drain, taskless_contact_addresses,
    taskless_contacts_create} from './contacts'
import {MustInterpret, MustReauthenticate, MustRecover, MustWait} from '../utils/exceptions'


let db:Database
let store:MockStore
let oauth:OAuth

// Recorded requests and a router for fake Google responses
let requests:{url:string, params:Record<string, string|string[]>|undefined, method:string,
    body:unknown}[]
let routes:Record<string, (body:unknown)=>Response>

beforeEach(async () => {
    ({db, store} = await setup_globals())
    oauth = await db.oauths.create({issuer: 'google', issuer_id: 'gid', email: 'a@gmail.com',
        scope_sets: ['contacts']} as OAuth)
    requests = []
    routes = {}
    vi.spyOn(oauth_module, 'oauth_request').mockImplementation(
        async (_oauth, url, params, method='GET', body) => {
            const path = url.replace('https://people.googleapis.com/v1/', '')
            requests.push({url: path, params, method, body})
            const handler = routes[`${method} ${path}`]
            if (!handler){
                throw new Error(`No route for ${method} ${path}`)
            }
            return handler(body)
        })
})

afterEach(() => {
    vi.restoreAllMocks()
})


// Helpers
const task = (params:unknown[], options:unknown[]=[]) => new Task('test', params, options)
const route = (key:string, data:unknown, status=200) => {
    routes[key] = () => json_response(data, status)
}
const person = (id:string, name:string, emails:string[], notes?:string) => ({
    resourceName: `people/${id}`,
    names: [{unstructuredName: name}],
    emailAddresses: emails.map((value, i) => ({value, metadata: {primary: i === 1}})),
    biographies: notes ? [{contentType: 'TEXT_HTML', value: '<b>x</b>'},
        {contentType: 'TEXT_PLAIN', value: notes}] : undefined,
})


describe('contacts_sync (google)', () => {

    test('full sync creates, updates and removes contacts and groups', async () => {
        // Existing contacts: one to update, one to remove
        const [keep, gone] = await db.contacts.create([
            {name: 'Old', address: 'keep2@x', service_account: 'google:gid', service_id: 'p1'},
            {name: 'Gone', address: 'g@x', service_account: 'google:gid', service_id: 'p9'},
        ])
        const old_group = await db.groups.create('Old', [], 'google:gid', 'old')
        const updated_group = await db.groups.create('Rename', [], 'google:gid', 'g1')

        // Two pages of people
        let page = 0
        routes['GET people/me/connections'] = () => {
            page++
            return json_response(page === 1
                ? {connections: [person('p1', 'Keep', ['keep1@x', 'keep2@x'], 'notes'),
                    person('p2', 'New', ['new@x'])], nextPageToken: 'next', totalItems: 150}
                : {connections: [{resourceName: 'people/p3', names: []}],
                    nextSyncToken: 'sync'})
        }
        route('GET contactGroups', {contactGroups: [
            {resourceName: 'contactGroups/g1', name: 'Renamed', groupType: 'USER_CONTACT_GROUP',
                memberCount: 2},
            {resourceName: 'contactGroups/g2', name: 'New', groupType: 'USER_CONTACT_GROUP',
                memberCount: 1},
            {resourceName: 'contactGroups/starred', groupType: 'SYSTEM_CONTACT_GROUP'},
        ]})
        route('GET contactGroups:batchGet', {responses: [
            {contactGroup: {resourceName: 'contactGroups/g1', name: 'Renamed',
                memberResourceNames: ['people/p1', 'people/p2', 'people/unknown']}},
            {contactGroup: {resourceName: 'contactGroups/g2', name: ''}},
        ]})

        const t = task([oauth.id])
        await contacts_sync(t)
        await new Promise(r => setTimeout(r, 20))  // Fire-and-forget db writes

        // Contacts
        const contacts = await db.contacts.list_for_account('google', 'gid')
        const by_sid = Object.fromEntries(contacts.map(c => [c.service_id, c]))
        expect(Object.keys(by_sid).sort()).toEqual(['p1', 'p2'])
        expect(by_sid['p1']!.id).toBe(keep!.id)
        expect(by_sid['p1']!.name).toBe('Keep')
        expect(by_sid['p1']!.address).toBe('keep2@x')  // Non-primary kept since still present
        expect(by_sid['p1']!.notes).toBe('notes')
        expect(by_sid['p2']!.address).toBe('new@x')
        expect(await db.contacts.get(gone!.id)).toBeUndefined()

        // Groups
        const groups = await db.groups.list_for_account('google', 'gid')
        expect(groups.map(g => g.service_id).sort()).toEqual(['g1', 'g2'])
        const g1 = groups.find(g => g.service_id === 'g1')!
        expect(g1.id).toBe(updated_group.id)
        expect(g1.name).toBe('Renamed')
        expect(g1.contacts.sort()).toEqual([by_sid['p1']!.id, by_sid['p2']!.id].sort())
        expect(await db.groups.get(old_group.id)).toBeUndefined()

        // Task and oauth state
        expect(t.label).toContain('a@gmail.com')
        expect((await db.oauths.get(oauth.id))!.contacts_sync_token).toBe('sync')
        expect((await db.oauths.get(oauth.id))!.contacts_sync_last).toBeInstanceOf(Date)
        expect(requests[1]!.params!['pageToken']).toBe('next')
    })

    test('address replaced with primary when existing one removed', async () => {
        await db.contacts.create({name: 'A', address: 'old@x', service_account: 'google:gid',
            service_id: 'p1'})
        route('GET people/me/connections', {connections: [person('p1', 'A', ['a@x', 'b@x'])],
            nextSyncToken: 's'})
        route('GET contactGroups', {contactGroups: []})
        await contacts_sync(task([oauth.id]))
        await new Promise(r => setTimeout(r, 10))
        expect((await db.contacts.list())[0]!.address).toBe('b@x')
    })

    test('group batches respect member limit even with empty groups', async () => {
        // BUG #google-group-batching: memberCount is omitted by Google for empty groups, making
        //      the running total NaN so the 1000 member limit is never enforced afterwards
        route('GET people/me/connections', {nextSyncToken: 's'})
        route('GET contactGroups', {contactGroups: [
            {resourceName: 'contactGroups/empty', groupType: 'USER_CONTACT_GROUP'},
            {resourceName: 'contactGroups/a', groupType: 'USER_CONTACT_GROUP', memberCount: 900},
            {resourceName: 'contactGroups/b', groupType: 'USER_CONTACT_GROUP', memberCount: 900},
        ]})
        route('GET contactGroups:batchGet', {responses: []})
        await contacts_sync(task([oauth.id]))
        const batches = requests.filter(r => r.url === 'contactGroups:batchGet')
        expect(batches).toHaveLength(2)
    })

    test('group batches split at 40 groups', async () => {
        route('GET people/me/connections', {nextSyncToken: 's'})
        route('GET contactGroups', {contactGroups: [...Array(45).keys()].map(i => (
            {resourceName: `contactGroups/${i}`, groupType: 'USER_CONTACT_GROUP',
                memberCount: 1})),
        })
        route('GET contactGroups:batchGet', {responses: []})
        await contacts_sync(task([oauth.id]))
        expect(requests.filter(r => r.url === 'contactGroups:batchGet')).toHaveLength(2)
    })

    test('setup enables sync, sets default and evolves into sync', async () => {
        route('GET people/me/connections', {nextSyncToken: 's'})
        route('GET contactGroups', {contactGroups: []})
        const t = task([oauth.id])
        await contacts_oauth_setup(t)
        expect((await db.oauths.get(oauth.id))!.contacts_sync).toBe(true)
        expect(store.state.default_contacts).toBe('google:gid')
        expect(t.name).toBe('contacts_sync')
    })

    test('aborts when oauth missing', async () => {
        await expect(contacts_sync(task(['missing']))).rejects.toBeInstanceOf(TaskAborted)
        await expect(contacts_oauth_setup(task(['missing']))).rejects.toBeInstanceOf(TaskAborted)
    })

    test('maps google error statuses', async () => {
        const cases:[number, unknown][] = [[401, MustReauthenticate], [403, MustReauthenticate],
            [404, MustRecover], [429, MustWait], [500, MustWait], [400, MustInterpret]]
        for (const [status, error_class] of cases){
            route('GET people/me/connections', {}, status)
            await expect(contacts_sync(task([oauth.id]))).rejects.toBeInstanceOf(error_class)
        }
    })
})


describe('contact changes', () => {

    // Helper to create a synced contact
    async function synced_contact(){
        return db.contacts.create({name: 'C', address: 'c@x', service_account: 'google:gid',
            service_id: 'p1'})
    }

    test('change name and notes', async () => {
        const contact = await synced_contact()
        route('GET people/p1', {resourceName: 'people/p1', etag: 'e', biographies: [
            {contentType: 'TEXT_HTML', value: 'html'}, {contentType: 'TEXT_PLAIN', value: 'old'}]})
        route('PATCH people/p1:updateContact', {})
        await contacts_change_property(task([oauth.id, contact.id, 'name'], ['New Name']))
        expect(requests.at(-1)!.body).toMatchObject({names: [{unstructuredName: 'New Name'}]})
        await contacts_change_property(task([oauth.id, contact.id, 'notes'], ['New notes']))
        expect((requests.at(-1)!.body as {biographies:unknown}).biographies).toEqual([
            {contentType: 'TEXT_HTML', value: 'html'},
            {contentType: 'TEXT_PLAIN', value: 'New notes'}])
        const saved = (await db.contacts.get(contact.id))!
        expect([saved.name, saved.notes]).toEqual(['New Name', 'New notes'])
    })

    test('change properties abort when records missing', async () => {
        const contact = await synced_contact()
        await expect(contacts_change_property(task(['missing', contact.id, 'name'], ['x'])))
            .rejects.toBeInstanceOf(TaskAborted)
        await expect(contacts_change_property(task([oauth.id, 'missing', 'name'], ['x'])))
            .rejects.toBeInstanceOf(TaskAborted)
        await expect(contacts_change_email(task(['missing', contact.id], [[], ''])))
            .rejects.toBeInstanceOf(TaskAborted)
        await expect(contacts_change_email(task([oauth.id, 'missing'], [[], ''])))
            .rejects.toBeInstanceOf(TaskAborted)
    })

    test('change email adds and removes addresses', async () => {
        const contact = await synced_contact()
        route('GET people/p1', {resourceName: 'people/p1', emailAddresses: [
            {value: 'c@x', displayName: 'keep'}, {value: 'old@x'}]})
        route('PATCH people/p1:updateContact', {})
        await contacts_change_email(task([oauth.id, contact.id], [['c@x', 'new@x'], 'new@x']))
        expect((requests.at(-1)!.body as {emailAddresses:unknown}).emailAddresses).toEqual([
            {value: 'c@x', displayName: 'keep'}, {value: 'new@x'}])
        expect((await db.contacts.get(contact.id))!.address).toBe('new@x')
    })

    test('change email adds addresses when contact had none', async () => {
        const contact = await synced_contact()
        route('GET people/p1', {resourceName: 'people/p1'})
        route('PATCH people/p1:updateContact', {})
        await contacts_change_email(task([oauth.id, contact.id], [['n@x'], 'n@x']))
        expect(requests.at(-1)!.body).toMatchObject({emailAddresses: [{value: 'n@x'}]})
    })

    test('change email skips update when addresses unchanged', async () => {
        // BUG #lodash-xor: `xor([a, b])` is passed a single array of arrays (should be
        //      `xor(a, b)`) so the "nothing changed" shortcut never triggers
        const contact = await synced_contact()
        route('GET people/p1', {resourceName: 'people/p1', emailAddresses: [{value: 'c@x'},
            {value: 'd@x'}]})
        route('PATCH people/p1:updateContact', {})
        await contacts_change_email(task([oauth.id, contact.id], [['c@x', 'd@x'], 'd@x']))
        expect(requests.filter(r => r.method === 'PATCH')).toHaveLength(0)
        expect((await db.contacts.get(contact.id))!.address).toBe('d@x')
    })

    test('remove contact (including already deleted remotely)', async () => {
        const contact = await synced_contact()
        route('DELETE people/p1:deleteContact', {}, 404)
        await contacts_remove(task([contact.id]))
        expect(await db.contacts.get(contact.id)).toBeUndefined()
        await expect(contacts_remove(task([contact.id]))).resolves.toBeUndefined()
        const other = await db.contacts.create({service_account: 'google:none', service_id: 'x'})
        await expect(contacts_remove(task([other.id]))).rejects.toBeInstanceOf(TaskAborted)
        const failing = await synced_contact()
        route('DELETE people/p1:deleteContact', {}, 500)
        await expect(contacts_remove(task([failing.id]))).rejects.toBeInstanceOf(MustWait)
    })

    test('create contact via task uses params from start_contacts_create', async () => {
        // BUG #contacts-create-params: start_contacts_create() passes [oauth_id, address] as
        //      params and [name] as options, but the task reads [oauth_id, name, address] params
        route('POST people:createContact', {resourceName: 'people/new'})
        await contacts_create(task([oauth.id, 'n@x'], ['Name']))
        const created = (await db.contacts.list())[0]!
        expect([created.name, created.address, created.service_id]).toEqual(['Name', 'n@x', 'new'])
    })

    test('taskless create and addresses', async () => {
        route('POST people:createContact', {resourceName: 'people/new'})
        const contact = await taskless_contacts_create(oauth, 'N', 'n@x')
        expect(contact.service_account).toBe('google:gid')
        expect(contact.service_id).toBe('new')
        route('GET people/new', {emailAddresses: [{value: 'a@x'}, {value: 'a@x'}, {value: 'b@x'}]})
        expect(await taskless_contact_addresses(oauth, 'new')).toEqual(['a@x', 'b@x'])
        route('GET people/new', {})
        expect(await taskless_contact_addresses(oauth, 'new')).toEqual([])
    })
})


describe('group changes', () => {

    // Helper to create a synced group
    async function synced_group(contacts:string[]=[]){
        return db.groups.create('G', contacts, 'google:gid', 'g1')
    }

    test('create group and evolve into fill', async () => {
        route('POST contactGroups', {resourceName: 'contactGroups/new'})
        route('POST contactGroups/new/members:modify', {})
        const contact = await db.contacts.create({service_account: 'google:gid', service_id: 'p1'})
        const t = task([oauth.id, 'Group'], [[contact.id]])
        await contacts_group_create(t)
        const group = (await db.groups.list())[0]!
        expect(group.service_id).toBe('new')
        expect(group.contacts).toEqual([contact.id])
        expect(t.name).toBe('contacts_group_fill')
        expect(requests.at(-1)!.body).toEqual({resourceNamesToAdd: ['people/p1']})
        await expect(contacts_group_create(task(['missing', 'x'], [])))
            .rejects.toBeInstanceOf(TaskAborted)
    })

    test('remove, rename, fill and drain', async () => {
        const [c1, c2] = await db.contacts.create([
            {service_account: 'google:gid', service_id: 'p1'},
            {service_account: 'google:gid', service_id: 'p2'}])
        const group = await synced_group([c1!.id])
        route('POST contactGroups/g1/members:modify', {})
        await contacts_group_fill(task([group.id], [[c1!.id, c2!.id, 'missing']]))
        expect((await db.groups.get(group.id))!.contacts).toEqual([c1!.id, c2!.id])
        await contacts_group_drain(task([group.id], [[c1!.id]]))
        expect((await db.groups.get(group.id))!.contacts).toEqual([c2!.id])
        expect(requests.at(-1)!.body).toEqual({resourceNamesToRemove: ['people/p1']})

        route('GET contactGroups/g1', {resourceName: 'contactGroups/g1', name: 'G'})
        route('PUT contactGroups/g1', {})
        await contacts_group_name(task([group.id], ['Renamed']))
        expect((await db.groups.get(group.id))!.name).toBe('Renamed')
        route('PUT contactGroups/g1', {}, 409)
        await expect(contacts_group_name(task([group.id], ['Dup'])))
            .rejects.toThrow('same name')
        route('PUT contactGroups/g1', {}, 400)
        await expect(contacts_group_name(task([group.id], ['Bad'])))
            .rejects.toBeInstanceOf(MustInterpret)

        route('DELETE contactGroups/g1', {})
        await contacts_group_remove(task([group.id]))
        expect(await db.groups.get(group.id)).toBeUndefined()
        await expect(contacts_group_remove(task([group.id]))).resolves.toBeUndefined()
    })

    test('group tasks abort when group or oauth missing', async () => {
        for (const fn of [contacts_group_name, contacts_group_fill, contacts_group_drain]){
            await expect(fn(task(['missing'], [[]]))).rejects.toBeInstanceOf(TaskAborted)
        }
        const orphan = await db.groups.create('G', [], 'google:none', 'g')
        for (const fn of [contacts_group_name, contacts_group_fill, contacts_group_drain,
                contacts_group_remove]){
            await expect(fn(task([orphan.id], [[]]))).rejects.toBeInstanceOf(TaskAborted)
        }
    })
})

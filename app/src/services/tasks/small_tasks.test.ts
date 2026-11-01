
// Tests for configs, hosts, management and resume tasks

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {setup_globals} from '@/../tests/unit_utils'
import {Database} from '../database/database'
import {Profile} from '../database/profiles'
import {Task, TaskAborted, task_manager} from './tasks'
import {configs_update} from './configs'
import {hosts_manager_delete, hosts_manager_update, hosts_storage_update} from './hosts'
import {retract_message} from './management'
import {resume_tasks} from './resume'
import {HOST_STORAGE_VERSION} from '../hosts/common'
import {HostManagerAws} from '../hosts/aws_manager'
import {HostUserAws} from '../hosts/aws_user'
import {decrypt_sym, export_key, import_key_sym} from '../utils/crypt'
import {url64_to_buffer, utf8_to_string} from '../utils/coding'
import type {HostUser} from '../hosts/types'
import {sleep} from '../utils/async'


let db:Database
let profile:Profile
let host:Record<string, ReturnType<typeof vi.fn>>

beforeEach(async () => {
    ({db} = await setup_globals())
    profile = await db.profiles.create()
    profile.setup_step = null
    profile.email = 'me@x.com'
    profile.options.send_to_self = 'no'
    profile.host = {cloud: 'aws', bucket: 'b', region: 'r', generated: {
        credentials: {accessKeyId: '', secretAccessKey: ''}, api_id: 'api'}}
    await db.profiles.set(profile)
    host = {
        upload_displayer_config: vi.fn(async () => undefined),
        upload_subscribe_config: vi.fn(async () => undefined),
        upload_responder_config: vi.fn(async () => undefined),
        update_email: vi.fn(async () => undefined),
        update_services: vi.fn(async () => undefined),
        delete_file: vi.fn(async () => undefined),
        list_files: vi.fn(async () => ['assets/m/a1', 'assets/m/a2']),
    }
    vi.spyOn(db, 'new_host_user').mockResolvedValue(host as unknown as HostUser)
})

afterEach(() => {
    vi.restoreAllMocks()
})


// Decrypt a config with the profile's shared secret
async function decrypt_config(buffer:ArrayBuffer){
    const key = await import_key_sym(await export_key(profile.host_state.shared_secret))
    return JSON.parse(utf8_to_string(await decrypt_sym(buffer, key))) as Record<string, unknown>
}


describe('configs_update', () => {

    test('uploads all three configs and marks uploaded', async () => {
        const form = await db.subscribe_forms.create(profile.id)
        const task = new Task('configs_update', [profile.id], [])
        await configs_update(task)

        const displayer = await decrypt_config(host['upload_displayer_config']!.mock.calls[0]![0])
        expect(displayer).toMatchObject({responder:
            'https://api.execute-api.r.amazonaws.com/responder/', allow_replies: true})
        expect(typeof displayer['resp_key_public']).toBe('string')

        const responder = await decrypt_config(host['upload_responder_config']!.mock.calls[0]![0])
        expect(responder).toMatchObject({email: 'me@x.com', subscribe_forms: [form.id]})
        expect(host['update_email']).toHaveBeenCalledWith('me@x.com')

        // Subscribe forms are each encrypted with their own id
        const forms = JSON.parse(host['upload_subscribe_config']!.mock.calls[0]![0]) as string[]
        const form_key = await import_key_sym(url64_to_buffer(form.id))
        const form_config = JSON.parse(utf8_to_string(await decrypt_sym(
            url64_to_buffer(forms[0]!), form_key))) as Record<string, unknown>
        expect(form_config).toMatchObject({id: form.id, text: form.text})

        const saved = (await db.profiles.get(profile.id))!
        expect(saved.configs_need_uploading).toBe(false)
        expect(task.subtasks_total).toBe(3)
    })

    test('only uploads configs that need it', async () => {
        profile.host_state.displayer_config_uploaded = true
        profile.host_state.responder_config_uploaded = true
        await db.profiles.set(profile)
        await configs_update(new Task('configs_update', [profile.id], []))
        expect(host['upload_displayer_config']).not.toHaveBeenCalled()
        expect(host['upload_responder_config']).not.toHaveBeenCalled()
        expect(host['upload_subscribe_config']).toHaveBeenCalledWith('[]')
    })

    test('does nothing when up to date and aborts for missing profile', async () => {
        profile.host_state.displayer_config_uploaded = true
        profile.host_state.subscribe_config_uploaded = true
        profile.host_state.responder_config_uploaded = true
        await db.profiles.set(profile)
        await configs_update(new Task('configs_update', [profile.id], []))
        expect(db.new_host_user).not.toHaveBeenCalled()
        await expect(configs_update(new Task('configs_update', ['missing'], [])))
            .rejects.toBeInstanceOf(TaskAborted)
    })

    test('settings changed during upload are not marked as uploaded', async () => {
        host['upload_displayer_config']!.mockImplementation(async () => {
            const fresh = (await db.profiles.get(profile.id))!
            fresh.options.allow_replies = false
            fresh.host_state.displayer_config_uploaded = false
            await db.profiles.set(fresh)
        })
        await configs_update(new Task('configs_update', [profile.id], []))
        expect((await db.profiles.get(profile.id))!.host_state.displayer_config_uploaded)
            .toBe(false)
    })

    test('configs not uploaded this run are not marked as uploaded', async () => {
        // Displayer config up to date at start but invalidated while responder config uploads
        profile.host_state.displayer_config_uploaded = true
        await db.profiles.set(profile)
        host['upload_responder_config']!.mockImplementation(async () => {
            const fresh = (await db.profiles.get(profile.id))!
            fresh.options.allow_reactions = !fresh.options.allow_reactions
            fresh.host_state.displayer_config_uploaded = false
            await db.profiles.set(fresh)
        })
        await configs_update(new Task('configs_update', [profile.id], []))
        const state = (await db.profiles.get(profile.id))!.host_state
        expect(host['upload_displayer_config']).not.toHaveBeenCalled()
        expect(state.displayer_config_uploaded).toBe(false)
        expect(state.subscribe_config_uploaded).toBe(true)
        // Responder config also includes allow_reactions so must be re-uploaded too
        expect(state.responder_config_uploaded).toBe(false)
    })
})


describe('hosts tasks', () => {

    test('hosts_storage_update updates services and version', async () => {
        const task = new Task('hosts_storage_update', [profile.id], [])
        await hosts_storage_update(task)
        expect(host['update_services']).toHaveBeenCalledWith(task)
        expect((await db.profiles.get(profile.id))!.host_state.version)
            .toBe(HOST_STORAGE_VERSION)
        await expect(hosts_storage_update(new Task('', ['missing'], [])))
            .rejects.toBeInstanceOf(TaskAborted)
    })

    test('manager delete and update use host classes', async () => {
        const del = vi.spyOn(HostManagerAws.prototype, 'delete_storage').mockResolvedValue()
        const update = vi.spyOn(HostUserAws.prototype, 'update_services').mockResolvedValue()
        const creds = {accessKeyId: 'k', secretAccessKey: 's'}
        const t1 = new Task('', ['aws', 'bucket'], ['region', creds])
        await hosts_manager_delete(t1)
        expect(del).toHaveBeenCalledWith(t1, 'bucket', 'region')
        expect(t1.label).toContain('Deleting')
        const t2 = new Task('', ['aws', 'bucket'], ['region', creds])
        await hosts_manager_update(t2)
        expect(update).toHaveBeenCalledWith(t2)
        expect(t2.label).toContain('Updating')
    })
})


describe('retract_message', () => {

    // Create a sent message with copies
    async function sent_message(){
        await db.contacts.create([{name: 'A'}, {name: 'B'}])
        const draft = await db.drafts.create()
        draft.profile = profile.id
        draft.title = 'T'
        draft.recipients.include_groups = ['all']
        await db.drafts.set(draft)
        return db.draft_to_message(draft.id)
    }

    test('deletes copies and assets and marks expired', async () => {
        const msg = await sent_message()
        const task = new Task('retract_message', [msg.id], [false])
        await retract_message(task)
        expect(host['delete_file']).toHaveBeenCalledTimes(2 * 2 + 2)
        expect(host['list_files']).toHaveBeenCalledWith(`assets/${msg.id}/`)
        expect((await db.messages.get(msg.id))!.expired).toBe(true)
        expect((await db.copies.list_for_msg(msg.id)).every(c => c.expired)).toBe(true)
        expect(task.label).toContain('Retracting')
    })

    test('can also remove the message', async () => {
        const msg = await sent_message()
        await retract_message(new Task('retract_message', [msg.id], [true]))
        expect(await db.messages.get(msg.id)).toBeUndefined()
    })

    test('aborts for missing message or profile', async () => {
        await expect(retract_message(new Task('', ['missing'], [false])))
            .rejects.toBeInstanceOf(TaskAborted)
        const msg = await sent_message()
        await db.profiles.remove(profile.id)
        await expect(retract_message(new Task('', [msg.id], [false])))
            .rejects.toBeInstanceOf(TaskAborted)
    })
})


describe('resume_tasks', () => {

    test('starts needed updates and schedules recurring checks', async () => {
        // Don't actually schedule intervals (fake timers would stall fake-indexeddb)
        const intervals = vi.spyOn(self, 'setInterval').mockReturnValue(0 as never)
        const start = vi.spyOn(task_manager, 'start').mockResolvedValue(new Task('', [], []))
        const oauth_due = await db.oauths.create({issuer: 'google', issuer_id: '1',
            contacts_sync: true, contacts_sync_last: null} as never)
        await db.oauths.create({issuer: 'google', issuer_id: '2', contacts_sync: true,
            contacts_sync_last: new Date()} as never)
        await db.oauths.create({issuer: 'google', issuer_id: '3', contacts_sync: false} as never)

        await resume_tasks()
        expect(start).toHaveBeenCalledWith('configs_update', [profile.id])
        expect(start).toHaveBeenCalledWith('hosts_storage_update', [profile.id])

        await sleep(50)  // Instant handlers run async
        expect(start).toHaveBeenCalledWith('responses_receive', [], [], true)
        expect(start).toHaveBeenCalledWith('contacts_sync', [oauth_due.id], [], true)
        expect(start.mock.calls.filter(c => c[0] === 'contacts_sync')).toHaveLength(1)
        expect(intervals.mock.calls.map(c => c[1])).toEqual([60 * 1000, 2 * 60 * 60 * 1000])
    })
})

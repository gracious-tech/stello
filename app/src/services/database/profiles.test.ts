
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {setup_globals, MemoryNative} from '@/../tests/unit_utils'
import {Database} from './database'
import {Profile} from './profiles'
import {HOST_STORAGE_VERSION} from '@/services/hosts/common'
import {external_encrypt} from '@/services/misc/external_crypt'
import {url64_to_buffer} from '../utils/coding'


let db:Database
let native:MemoryNative

beforeEach(async () => {
    ({db, native} = await setup_globals())
})


// Helper for creating a profile object with overrides
async function profile_with(changes:(p:Profile)=>void){
    const profile = await db.profiles.create_object()
    changes(profile)
    return profile
}


describe('Profile getters', () => {

    test('setup_complete and display_host', async () => {
        const profile = await db.profiles.create_object()
        expect(profile.setup_complete).toBe(false)
        expect(profile.display).toBe('New Account')
        profile.host = {cloud: 'aws', bucket: 'bkt', region: 'r', generated: {credentials:
            {accessKeyId: '', secretAccessKey: ''}}}
        expect(profile.display_host).toBe('bkt')
        profile.host = {cloud: 'gracious', plan: 'c', username: 'usr', password: '',
            federated_id: '', id_token: '', id_token_exires: 0}
        expect(profile.display_host).toBe('usr')
    })

    test('email_domain', async () => {
        expect((await profile_with(p => {p.email = 'a@b.com'})).email_domain).toBe('b.com')
        expect((await profile_with(p => {p.email = 'invalid'})).email_domain).toBe(null)
    })

    test('smtp detection by domain or host', async () => {
        const gmail = await profile_with(p => {p.email = 'x@GMAIL.com'})
        expect(gmail.smtp_detected).toBe('google')
        expect(gmail.smtp_oauth_supported).toBe(true)
        expect(gmail.smtp_settings).toMatchObject({host: 'smtp.gmail.com', port: 465,
            starttls: false, user: 'x@GMAIL.com'})
        const by_host = await profile_with(p => {
            p.email = 'x@custom.com'
            p.smtp.host = 'smtp.office365.com'
        })
        expect(by_host.smtp_detected).toBe('microsoft')
        const yahoo = await profile_with(p => {p.email = 'x@yahoo.com'})
        expect(yahoo.smtp_oauth_supported).toBe(false)
        const none = await profile_with(p => {p.email = ''})
        expect(none.smtp_detected).toBe(null)
        expect(none.smtp_detected_config).toBe(null)
    })

    test('smtp_settings for custom provider', async () => {
        const custom = await profile_with(p => {p.email = 'x@custom.com'})
        expect(custom.smtp_settings).toEqual({oauth: null, host: 'smtp.custom.com', port: 465,
            starttls: false, user: 'x@custom.com', pass: ''})
        custom.smtp = {...custom.smtp, host: 'mail.custom.com', port: 587, starttls: true,
            user: 'u'}
        expect(custom.smtp_settings).toMatchObject({host: 'mail.custom.com', port: 587,
            starttls: true, user: 'u'})
        const empty = await profile_with(p => {p.email = 'invalid'})
        expect(empty.smtp_settings.host).toBe('')
    })

    test('smtp_ready and reply_to', async () => {
        const profile = await profile_with(p => {p.email = 'a@b.com'})
        expect(profile.smtp_ready).toBe(false)
        profile.smtp.oauth = 'o'
        expect(profile.smtp_ready).toBe(true)
        expect(profile.smtp_reply_to).toEqual({name: profile.smtp_reply_to_name,
            address: 'a@b.com'})
        profile.options.smtp_no_reply = false
        expect(profile.smtp_reply_to).toBeUndefined()
    })

    test('configs_need_uploading and host_needs_update', async () => {
        const profile = await db.profiles.create_object()
        expect(profile.configs_need_uploading).toBe(false)  // Not setup yet
        expect(profile.host_needs_update).toBe(false)
        profile.setup_step = null
        profile.host = {cloud: 'aws', bucket: 'b', region: 'r', generated: {credentials:
            {accessKeyId: '', secretAccessKey: ''}}}
        expect(profile.configs_need_uploading).toBe(true)
        expect(profile.host_needs_update).toBe(true)
        profile.host_state.version = HOST_STORAGE_VERSION
        expect(profile.host_needs_update).toBe(false)
        profile.host_state.displayer_config_uploaded = true
        profile.host_state.subscribe_config_uploaded = true
        profile.host_state.responder_config_uploaded = true
        expect(profile.configs_need_uploading).toBe(false)
        profile.host = {cloud: 'gracious', plan: 'c', username: 'u', password: '',
            federated_id: 'f', id_token: '', id_token_exires: 0}
        expect(profile.host_needs_update).toBe(false)
        expect(profile.host_accessible).toBeTruthy()
    })

    test('urls for aws host', async () => {
        const profile = await profile_with(p => {
            p.host = {cloud: 'aws', bucket: 'bkt', region: 'us-west-2', generated: {
                credentials: {accessKeyId: '', secretAccessKey: ''}, api_id: 'api'}}
        })
        expect(profile.max_lifespan).toBe(Infinity)
        expect(profile.api).toBe('https://api.execute-api.us-west-2.amazonaws.com/')
        expect(profile.user).toBe('_user')
        expect(profile.view_domain).toBe('bkt.s3-us-west-2.amazonaws.com')
        expect(profile.view_displayer).toBe('https://bkt.s3-us-west-2.amazonaws.com/_')
        expect(profile.view_url('cfg', 'copy', new Uint8Array([0xfb, 0xff]).buffer, 'act'))
            .toBe('https://bkt.s3-us-west-2.amazonaws.com/_#cfg,copy,-_8~,act')
    })

    test('urls for gracious host', async () => {
        vi.stubEnv('VITE_HOSTED_API', 'https://api/')
        vi.stubEnv('VITE_HOSTED_DOMAIN_UNBRANDED', 'unbranded.news')
        vi.stubEnv('VITE_HOSTED_DOMAIN_BRANDED', 'branded.news')
        const profile = await profile_with(p => {
            p.host = {cloud: 'gracious', plan: 'c', username: 'usr', password: '',
                federated_id: '', id_token: '', id_token_exires: 0}
        })
        expect(profile.max_lifespan).toBe(730)
        expect(profile.api).toBe('https://api/')
        expect(profile.user).toBe('usr')
        expect(profile.view_domain).toBe('usr.unbranded.news')
        profile.options.generic_domain = false
        expect(profile.view_displayer).toBe('https://usr.branded.news/')
        expect(profile.view_url('cfg', 'copy', new ArrayBuffer(0))).toBe(
            'https://usr.branded.news/#cfg,copy,')
        vi.unstubAllEnvs()
    })

    test('host-dependent getters throw without host', async () => {
        const profile = await db.profiles.create_object()
        expect(() => profile.api).toThrow('impossible')
        expect(() => profile.user).toThrow('impossible')
        expect(() => profile.view_domain).toThrow('impossible')
    })

    test('get_authed_smtp_settings decrypts password', async () => {
        const profile = await profile_with(p => {p.email = 'a@custom.com'})
        expect((await profile.get_authed_smtp_settings()).pass).toBe('')
        profile.smtp.pass = await external_encrypt('secret')
        expect((await profile.get_authed_smtp_settings()).pass).toBe('secret')
    })
})


describe('DatabaseProfiles', () => {

    test('create, list, get and set', async () => {
        const profile = await db.profiles.create()
        expect(await db.profiles.list()).toHaveLength(1)
        profile.email = 'changed@x'
        await db.profiles.set(profile)
        expect((await db.profiles.get(profile.id))!.email).toBe('changed@x')
        expect(await db.profiles.get('missing')).toBeUndefined()
    })

    test('default theme color is always a new object', () => {
        expect(db.profiles.get_default_theme_color()).not.toBe(
            db.profiles.get_default_theme_color())
    })

    test('copy excludes host settings and duplicates blob files', async () => {
        native.files.set('Internal Files/a.png', new ArrayBuffer(2))
        const original = await db.profiles.create()
        original.email = 'a@b.com'
        original.host = {cloud: 'aws', bucket: 'b', region: 'r', generated: {credentials:
            {accessKeyId: '', secretAccessKey: ''}}}
        original.msg_options_identity.invite_image = 'a.png'
        original.options.reply_invite_image = 'missing.png'
        await db.profiles.set(original)
        const copy = await db.profiles.copy(original)
        expect(copy.id).not.toBe(original.id)
        expect(copy.email).toBe('a@b.com')
        expect(copy.host).toBe(null)
        expect(copy.msg_options_identity.invite_image).not.toBe('a.png')
        expect(typeof copy.msg_options_identity.invite_image).toBe('string')
        expect(copy.options.reply_invite_image).toBe(null)  // Unreadable so null
        expect(await db.profiles.get(copy.id)).toBeDefined()
    })

    test('remove cleans up related records and blobs', async () => {
        native.files.set('Internal Files/a.png', new ArrayBuffer(2))
        const profile = await db.profiles.create()
        profile.msg_options_identity.invite_image = 'a.png'
        await db.profiles.set(profile)
        const other = await db.profiles.create()
        const draft = await db.drafts.create()
        draft.profile = profile.id
        await db.drafts.set(draft)
        await db.unsubscribes.set({profile: profile.id, contact: 'c', sent: new Date(), ip: null,
            user_agent: null})
        await db.unsubscribes.set({profile: other.id, contact: 'c', sent: new Date(), ip: null,
            user_agent: null})
        await db.subscribe_forms.create(profile.id)
        await db.subscribe_forms.create(other.id)

        await db.profiles.remove(profile.id)
        expect(await db.profiles.get(profile.id)).toBeUndefined()
        expect((await db.drafts.get(draft.id))!.profile).toBe(null)
        expect(await db.unsubscribes.list()).toHaveLength(1)
        expect(await db.subscribe_forms.list_for_profile(profile.id)).toHaveLength(0)
        expect(await db.subscribe_forms.list_for_profile(other.id)).toHaveLength(1)
        expect(native.files.has('Internal Files/a.png')).toBe(false)

        await expect(db.profiles.remove('missing')).resolves.toBeUndefined()
    })

    test('new profile keys have expected usages', async () => {
        const profile = await db.profiles.create_object()
        expect(profile.host_state.shared_secret.usages).toEqual(['encrypt'])
        expect(profile.host_state.secret.usages.sort()).toEqual(['decrypt', 'encrypt'])
        // Subscribe form ids double as short keys, so shared secret must also be short
        expect((profile.host_state.shared_secret.algorithm as AesKeyAlgorithm).length).toBe(128)
        expect(url64_to_buffer('').byteLength).toBe(0)
    })
})

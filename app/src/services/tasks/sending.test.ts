// @vitest-environment happy-dom

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {setup_globals, MemoryNative, MockStore} from '@/../tests/unit_utils'
import {Database} from '../database/database'
import {Profile} from '../database/profiles'
import {Task, TaskAborted} from './tasks'
import {send_message, send_oauth_setup, Sender} from './sending'
import * as email from '../email/email'
import * as configs from './configs'
import * as hosts from './hosts'
import {decrypt_sym, export_key, import_key_sym} from '../utils/crypt'
import {utf8_to_string} from '../utils/coding'
import {HOST_STORAGE_VERSION} from '../hosts/common'
import {MustReauthenticate} from '../utils/exceptions'
import {OAuth} from '../database/oauths'
import {external_encrypt} from '../misc/external_crypt'
import type {HostUser} from '../hosts/types'
import type {Email} from '../native/types'
import type {PublishedCopy} from '@/shared/shared_types'


// Image processing relies on browser apis, so replace with simple fakes
vi.mock('@/services/misc/images', () => ({
    resize_image: async (source:{width:number, height:number}) => ({
        width: source.width, height: source.height,
        convertToBlob: async (o:{type:string}) => new Blob(['img'], {type: o.type}),
    }),
}))
vi.mock('@/services/misc/zip', () => {
    class ZipWriter {
        names:string[] = []
        async add(name:string){
            this.names.push(name)
        }
        async close(){
            return new TextEncoder().encode(this.names.join('|'))
        }
    }
    return {zip: {ZipWriter, Uint8ArrayWriter: class {}, BlobReader: class {}}}
})


let db:Database
let native:MemoryNative
let store:MockStore
let profile:Profile
let uploads:Map<string, {data:ArrayBuffer, lifespan:number, max_reads:number}>
let emails:Email[]
let email_result:()=>Promise<boolean>

beforeEach(async () => {
    ({db, native, store} = await setup_globals())
    vi.stubGlobal('createImageBitmap', async () => ({width: 200, height: 100}))

    // Profile ready to send
    profile = await db.profiles.create()
    profile.setup_step = null
    profile.email = 'me@x.com'
    profile.options.send_to_self = 'no'
    profile.msg_options_identity.sender_name = 'Me'
    profile.host = {cloud: 'aws', bucket: 'b', region: 'r', generated: {
        credentials: {accessKeyId: '', secretAccessKey: ''}, api_id: 'api'}}
    profile.host_state.version = HOST_STORAGE_VERSION
    profile.host_state.displayer_config_uploaded = true
    profile.host_state.subscribe_config_uploaded = true
    profile.host_state.responder_config_uploaded = true
    profile.smtp.pass = await external_encrypt('password')
    await db.profiles.set(profile)

    // Fake host and email
    uploads = new Map()
    vi.spyOn(db, 'new_host_user').mockImplementation(async () => ({
        upload_file: async (path:string, data:ArrayBuffer, lifespan=Infinity,
            max_reads=Infinity) => {
            uploads.set(path, {data, lifespan, max_reads})
        },
    } as unknown as HostUser))
    emails = []
    email_result = async () => true
    vi.spyOn(email, 'new_email_task').mockImplementation(() => ({
        send: async (e:Email) => {
            emails.push(e)
            return email_result()
        },
        abort: vi.fn(),
    }))
})

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})


// Create a message with given sections and recipients
async function create_message(sections:string[][], recipients:{name:string, address:string}[],
        changes:(draft:import('../database/drafts').Draft)=>void=()=>undefined){
    const contacts = await db.contacts.create(recipients)
    const draft = await db.drafts.create()
    draft.profile = profile.id
    draft.title = 'Newsletter'
    draft.sections = sections as typeof draft.sections
    draft.recipients.include_contacts = contacts.map(c => c.id)
    changes(draft)
    await db.drafts.set(draft)
    return db.draft_to_message(draft.id)
}

async function decrypt_copy(copy_id:string):Promise<PublishedCopy>{
    // Decrypt an uploaded copy using the db record's secret
    // NOTE Copy secrets are encrypt-only so must reimport for decrypting
    const copy = (await db.copies.get(copy_id))!
    const key = await import_key_sym(await export_key(copy.secret))
    const buffer = await decrypt_sym(uploads.get(`copies/${copy_id}`)!.data, key)
    return JSON.parse(utf8_to_string(buffer)) as PublishedCopy
}


describe('send_message', () => {

    test('uploads assets and copies and emails each recipient', async () => {
        const text = await db.sections.create('text')
        if (text.content.type !== 'text'){
            throw new Error('impossible')
        }
        text.content.html = '<p>Hi <span data-mention="" data-id="contact_hello"></span>'
            + ' from <span data-mention="" data-id="sender_name"></span></p>'
        await db.sections.set(text)
        const video = await db.sections.create('video')
        const empty_video = await db.sections.create('video')
        if (video.content.type !== 'video'){
            throw new Error('impossible')
        }
        video.content.format = 'iframe_youtube'
        video.content.id = 'abc'
        await db.sections.set(video)
        const chart = await db.sections.create('chart')
        const msg = await create_message([[text.id], [video.id, empty_video.id], [chart.id]],
            [{name: 'Bob Smith', address: 'bob@x.com'}, {name: 'No Email', address: ''},
                {name: 'Bad', address: 'not-an-email'}])

        const task = new Task('send_message', [msg.id], [])
        await send_message(task)

        // All copies uploaded with invite images
        const copies = await db.copies.list_for_msg(msg.id)
        expect(copies).toHaveLength(3)
        for (const copy of copies){
            expect(copy.uploaded_latest).toBe(true)
            expect(uploads.has(`copies/${copy.id}`)).toBe(true)
            expect(uploads.has(`invite_images/${copy.id}`)).toBe(true)
            expect(uploads.get(`copies/${copy.id}`)!.max_reads).toBe(3)
            expect(uploads.get(`copies/${copy.id}`)!.lifespan).toBe(7)
        }

        // Copy contents personalised per contact
        const bob = copies.find(c => c.contact_name === 'Bob Smith')!
        const published = await decrypt_copy(bob.id)
        expect(published.title).toBe('Newsletter')
        expect(published.sections).toHaveLength(3)
        expect(published.sections[1]).toHaveLength(1)  // Empty video excluded
        const html = (published.sections[0]![0].content as {html:string}).html
        expect(html).toContain('>Bob<')
        expect(html).toContain('>Me<')
        expect(published.contact_address).toBe('bob@x.com')
        expect(published.has_max_reads).toBe(true)

        // Only valid address emailed and statuses recorded
        expect(emails.map(e => e.to.address)).toEqual(['bob@x.com'])
        expect(emails[0]!.subject).toBe('Newsletter')
        expect(emails[0]!.html).toContain('Hi <span data-mention="" data-id="contact_hello">Bob')
        expect(emails[0]!.html).toContain('#')
        expect(emails[0]!.html).toContain(',unsub,')
        expect(bob.invited).toBe(true)
        expect(copies.find(c => c.contact_name === 'Bad')!.invited).toBe(false)
        expect(copies.find(c => c.contact_name === 'No Email')!.invited).toBe(null)
        expect(task.subtasks_total).toBe(3)
        expect(task.subtasks_done).toBe(3)
        expect(store.state.tmp.invited).not.toBe(null)
    })

    test('images, files and pages produce assets', async () => {
        native.files.set('Internal Files/i.png', new ArrayBuffer(4))
        native.files.set('Internal Files/f.pdf', new ArrayBuffer(4))
        native.files.set('Internal Files/g.txt', new ArrayBuffer(4))
        const images = await db.sections.create('images')
        const single_file = await db.sections.create('files')
        const multi_files = await db.sections.create('files')
        const page = await db.sections.create('page')
        const sub = await db.sections.create('text')
        if (images.content.type !== 'images' || single_file.content.type !== 'files'
                || multi_files.content.type !== 'files' || page.content.type !== 'page'){
            throw new Error('impossible')
        }
        images.content.images = [{id: 'img1', data: 'i.png', caption: 'c1'},
            {id: 'img2', data: 'i.png', caption: 'c2'}]
        single_file.content.files = [{data: 'f.pdf', name: 'doc', ext: '.pdf'}]
        multi_files.content.files = [{data: 'g.txt', name: 'a', ext: '.txt'},
            {data: 'g.txt', name: 'a', ext: '.txt'}]
        multi_files.content.label = 'Bundle'
        page.content.image = 'i.png'
        page.content.headline = 'More'
        page.content.sections = [[sub.id]]
        for (const s of [images, single_file, multi_files, page]){
            await db.sections.set(s)
        }
        const msg = await create_message([[images.id], [single_file.id, multi_files.id],
            [page.id]], [{name: 'A', address: 'a@x.com'}])
        await send_message(new Task('send_message', [msg.id], []))

        const asset_keys = [...uploads.keys()].filter(k => k.startsWith('assets/'))
            .map(k => k.split('/')[2])
        expect(asset_keys.sort()).toEqual(['img1', 'img1j', 'img2', 'img2j', multi_files.id,
            page.id, `${page.id}j`, single_file.id].sort())
        expect((await db.messages.get(msg.id))!.assets_uploaded['img1']).toBe(true)

        const copy = (await db.copies.list_for_msg(msg.id))[0]!
        const published = await decrypt_copy(copy.id)
        const pub_images = published.sections[0]![0].content as {images:unknown[], hero:boolean}
        expect(pub_images.images).toEqual([{id: 'img1', caption: 'c1'},
            {id: 'img2', caption: 'c2'}])
        expect(published.sections[1]![0].content).toMatchObject({filename: 'doc.pdf',
            download: false})
        expect(published.sections[1]![1]!.content).toMatchObject({filename: 'Bundle.zip',
            mimetype: 'application/zip', download: true})
        expect(published.sections[2]![0].content).toMatchObject({type: 'page', image: page.id,
            headline: 'More'})
    })

    test('resending skips copies already uploaded and invited', async () => {
        const msg = await create_message([], [{name: 'A', address: 'a@x.com'},
            {name: 'B', address: 'b@x.com'}])
        email_result = async () => false  // First attempt fails for addresses
        await send_message(new Task('send_message', [msg.id], []))
        expect(emails).toHaveLength(2)
        const copy = (await db.copies.list_for_msg(msg.id))[0]!
        copy.invited = true
        await db.copies.set(copy)
        uploads.clear()
        email_result = async () => true
        await send_message(new Task('send_message', [msg.id], []))
        expect(emails).toHaveLength(3)
        expect(uploads.size).toBe(0)  // All uploaded already
    })

    test('contact changes are applied to unsent copies', async () => {
        const msg = await create_message([], [{name: 'A', address: 'wrong@x.com'}])
        email_result = async () => false
        await send_message(new Task('send_message', [msg.id], []))
        const copy = (await db.copies.list_for_msg(msg.id))[0]!
        const contact = (await db.contacts.get(copy.contact_id))!
        contact.address = 'right@x.com'
        await db.contacts.set(contact)
        email_result = async () => true
        await send_message(new Task('send_message', [msg.id], []))
        expect(emails.at(-1)!.to.address).toBe('right@x.com')
    })

    test('multiple-person contacts get unlimited reads and no subscription links', async () => {
        const msg = await create_message([], [{name: 'Family', address: 'f@x.com'}])
        const copy = (await db.copies.list_for_msg(msg.id))[0]!
        const contact = (await db.contacts.get(copy.contact_id))!
        contact.multiple = true
        await db.contacts.set(contact)
        await send_message(new Task('send_message', [msg.id], []))
        expect(uploads.get(`copies/${copy.id}`)!.max_reads).toBe(Infinity)
        expect(emails[0]!.html).not.toContain(',unsub,')
        expect((await decrypt_copy(copy.id)).permission_subscription).toBe(false)
    })

    test('email failure is thrown after all copies processed', async () => {
        const msg = await create_message([], [{name: 'A', address: 'a@x.com'},
            {name: 'B', address: 'b@x.com'}])
        email_result = async () => {throw new MustReauthenticate()}
        const task = new Task('send_message', [msg.id], [])
        await expect(send_message(task)).rejects.toBeInstanceOf(MustReauthenticate)
        expect(uploads.size).toBe(4)
        expect(task.fix_oauth).toBe(null)
        expect(await task.fix_settings!()).toBe("Finish sending after correcting settings")
        expect(store.dispatch).toHaveBeenCalledWith('show_dialog', expect.anything())
    })

    test('updates host services and configs before sending if needed', async () => {
        const update = vi.spyOn(hosts, 'hosts_storage_update').mockResolvedValue()
        const configs_update = vi.spyOn(configs, 'configs_update').mockResolvedValue()
        profile.host_state.version = 1
        profile.host_state.displayer_config_uploaded = false
        await db.profiles.set(profile)
        const msg = await create_message([], [])
        await send_message(new Task('send_message', [msg.id], []))
        expect(update).toHaveBeenCalledTimes(1)
        expect(configs_update).toHaveBeenCalledTimes(1)
    })

    test('aborts for missing message or profile', async () => {
        await expect(send_message(new Task('send_message', ['missing'], [])))
            .rejects.toBeInstanceOf(TaskAborted)
        const msg = await create_message([], [])
        await db.profiles.remove(profile.id)
        await expect(send_message(new Task('send_message', [msg.id], [])))
            .rejects.toBeInstanceOf(TaskAborted)
    })

    test('manual abort stops further copies', async () => {
        const msg = await create_message([], [{name: 'A', address: 'a@x.com'}])
        const task = new Task('send_message', [msg.id], [])
        task.abort()
        await expect(send_message(task)).rejects.toBeInstanceOf(TaskAborted)
        expect(emails).toHaveLength(0)
    })
})


describe('Sender inheritance getters', () => {

    test('draft values override profile, replies use reply defaults', async () => {
        const sender = new Sender()
        sender.profile = profile
        const msg = await create_message([], [])
        sender.msg = msg
        expect(sender.sender_name).toBe('Me')
        expect(sender.invite_button).toBe('Open Message')
        expect(sender.invite_image).toBe(null)
        expect(sender.invite_tmpl_email).toContain('latest news')
        msg.draft.reply_to = 'r'
        expect(sender.invite_button).toBe('Open Reply')
        expect(sender.invite_tmpl_email).toContain('has replied')
        msg.draft.options_identity.sender_name = 'Draft Name'
        msg.draft.options_identity.invite_button = 'Read'
        msg.draft.options_identity.invite_tmpl_email = 'custom'
        msg.draft.options_identity.invite_image = 'x.png'
        expect([sender.sender_name, sender.invite_button, sender.invite_tmpl_email,
            sender.invite_image]).toEqual(['Draft Name', 'Read', 'custom', 'x.png'])
    })
})


describe('send_oauth_setup', () => {

    test('configures profile to send with oauth after test email', async () => {
        const oauth = await db.oauths.create({issuer: 'google', issuer_id: 'g',
            email: 'new@gmail.com', name: 'Oauth Name'} as OAuth)
        profile.msg_options_identity.sender_name = ''
        await db.profiles.set(profile)
        await send_oauth_setup(new Task('send_oauth_setup', [oauth.id, profile.id], []))
        const saved = (await db.profiles.get(profile.id))!
        expect(saved.smtp.oauth).toBe(oauth.id)
        expect(saved.email).toBe('new@gmail.com')
        expect(saved.host_state.responder_config_uploaded).toBe(false)
        expect(saved.msg_options_identity.sender_name).toBe('Oauth Name')
        expect(emails[0]!.to.address).toBe('new@gmail.com')
    })

    test('aborts when missing records or test email fails', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const oauth = await db.oauths.create({issuer: 'google', issuer_id: 'g'} as OAuth)
        await expect(send_oauth_setup(new Task('', ['missing', profile.id], [])))
            .rejects.toThrow('Credentials missing')
        await expect(send_oauth_setup(new Task('', [oauth.id, 'missing'], [])))
            .rejects.toThrow('no longer exists')
        email_result = async () => {throw new Error('cannot send')}
        await expect(send_oauth_setup(new Task('', [oauth.id, profile.id], [])))
            .rejects.toThrow('cannot send email')
    })
})

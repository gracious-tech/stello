// @vitest-environment happy-dom

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import type {Mock} from 'vitest'

import {setup_globals, MemoryNative, MockStore} from '@/../tests/unit_utils'
import {Database} from '../database/database'
import {Profile} from '../database/profiles'
import {Task, TaskAborted} from './tasks'
import {send_message, send_oauth_setup, Sender} from './sending'
import * as email from '../email/email'
import * as configs from './configs'
import * as hosts from './hosts'
import {decrypt_sym, export_key, import_key_sym} from '../utils/crypt'
import {buffer_to_url64, url64_to_buffer, utf8_to_string} from '../utils/coding'
import {SECTION_IMAGE_WIDTH} from '../misc'
import {HOST_STORAGE_VERSION} from '../hosts/common'
import {MustReauthenticate} from '../utils/exceptions'
import {OAuth} from '../database/oauths'
import {external_encrypt} from '../misc/external_crypt'
import type {HostUser} from '../hosts/types'
import type {Email} from '../native/types'
import type {PublishedCopy} from '@/shared/shared_types'


// Record of resize calls so tests can confirm the dimensions images are limited to
const resize_calls = vi.hoisted(() => [] as {source_width:number, max_width:number,
    max_height:number, crop:boolean}[])

// Image processing relies on browser apis, so replace with simple fakes
// NOTE Output blobs contain their mimetype so tests can confirm the format used
vi.mock('@/services/misc/images', () => ({
    resize_image: async (source:{width:number, height:number}, max_width:number,
            max_height:number, crop:boolean) => {
        resize_calls.push({source_width: source.width, max_width, max_height, crop})
        return {
            width: source.width, height: source.height,
            convertToBlob: async (o:{type:string}) => new Blob([o.type], {type: o.type}),
        }
    },
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
let email_abort:Mock<()=>void>
let report_error:ReturnType<typeof vi.fn>
let upload_hook:(path:string)=>void
let email_task_hook:()=>void

beforeEach(async () => {
    ({db, native, store, report_error} = await setup_globals())
    resize_calls.length = 0
    // Image width varies with file size so tests can tell which file an image came from
    vi.stubGlobal('createImageBitmap', async (blob:Blob) => ({width: blob.size * 50, height: 100}))

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
    upload_hook = () => undefined
    vi.spyOn(db, 'new_host_user').mockImplementation(async () => ({
        upload_file: async (path:string, data:ArrayBuffer, lifespan=Infinity,
            max_reads=Infinity) => {
            upload_hook(path)
            uploads.set(path, {data, lifespan, max_reads})
        },
    } as unknown as HostUser))
    emails = []
    email_result = async () => true
    email_abort = vi.fn<()=>void>()
    email_task_hook = () => undefined
    vi.spyOn(email, 'new_email_task').mockImplementation(() => {
        email_task_hook()
        return {
            send: async (e:Email) => {
                emails.push(e)
                return email_result()
            },
            abort: email_abort,
        }
    })
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

async function decrypt_text(data:ArrayBuffer, secret:CryptoKey):Promise<string>{
    // Decrypt data as text using given secret
    // NOTE Secrets are often encrypt-only so must reimport for decrypting
    const key = await import_key_sym(await export_key(secret))
    return utf8_to_string(await decrypt_sym(data, key))
}

async function decrypt_copy(copy_id:string):Promise<PublishedCopy>{
    // Decrypt an uploaded copy using the db record's secret
    const copy = (await db.copies.get(copy_id))!
    const text = await decrypt_text(uploads.get(`copies/${copy_id}`)!.data, copy.secret)
    return JSON.parse(text) as PublishedCopy
}

async function decrypt_asset(msg_id:string, asset_id:string):Promise<string>{
    // Decrypt an uploaded asset as text using the message's assets key
    const msg = (await db.messages.get(msg_id))!
    return decrypt_text(uploads.get(`assets/${msg_id}/${asset_id}`)!.data, msg.assets_key)
}

function parse_invite(html:string):{image:string, unsub:string|undefined}{
    // Extract the image url and unsubscribe url from an invite's html
    const dom = new DOMParser().parseFromString(html, 'text/html')
    const links = [...dom.querySelectorAll('a')].map(a => a.getAttribute('href') ?? '')
    return {
        image: dom.querySelector('img')!.getAttribute('src')!,
        unsub: links.find(href => href.includes(',unsub,')),
    }
}

function mention(id:string, value=''):string{
    // Generate html for a template variable (with value if filled)
    return `<span data-mention="" data-id="${id}">${value}</span>`
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
            expect(copy.uploaded).toBe(true)
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
        expect(emails[0]!.from).toEqual({name: 'Me', address: 'me@x.com'})
        expect(emails[0]!.html).toContain('Hi <span data-mention="" data-id="contact_hello">Bob')
        expect(emails[0]!.html).toContain('#')
        expect(emails[0]!.html).toContain(',unsub,')
        expect(bob.invited).toBe(true)
        expect(copies.find(c => c.contact_name === 'Bad')!.invited).toBe(false)
        expect(copies.find(c => c.contact_name === 'No Email')!.invited).toBe(null)
        expect(task.subtasks_total).toBe(3)
        expect(task.subtasks_done).toBe(3)
        expect(store.state.tmp.invited).not.toBe(null)

        // Task can be aborted by user, shows progress, and email client not aborted
        expect(task.abortable).toBe(true)
        expect(task.show_count).toBe(true)
        expect(email_abort).not.toHaveBeenCalled()
    })

    // Each section type is published with its type and only the content the displayer needs
    test('published sections have correct types and contents', async () => {
        const text = await db.sections.create('text')
        const video = await db.sections.create('video')
        const chart = await db.sections.create('chart')
        if (text.content.type !== 'text' || video.content.type !== 'video'){
            throw new Error('impossible')
        }
        text.content.html = `<p>${mention('unknown')}</p>`
        video.content.format = 'iframe_youtube'
        video.content.id = 'abc'
        video.content.caption = 'Cap'
        for (const s of [text, video]){
            await db.sections.set(s)
        }
        const msg = await create_message([[text.id], [video.id], [chart.id]],
            [{name: 'A', address: 'a@x.com'}])
        await send_message(new Task('send_message', [msg.id], []))

        // Unknown template values replaced with a dash
        const copy = (await db.copies.list_for_msg(msg.id))[0]!
        const contents = (await decrypt_copy(copy.id)).sections.map(row => row[0].content)
        expect(contents[0]).toMatchObject({type: 'text', html: `<p>${mention('unknown', '-')}</p>`})
        expect(contents[1]).toMatchObject({type: 'video', format: 'iframe_youtube', id: 'abc',
            caption: 'Cap'})
        expect(contents[2]).toMatchObject({type: 'chart', chart: 'bar'})

        // Chart data only includes what is needed for display (not ids)
        expect((contents[2] as {data:unknown[]}).data).toEqual([
            {label: '', number: '$600', hue: 150},
            {label: '', number: '$800', hue: 300},
        ])
    })

    // Sections without content are excluded, along with rows that end up empty
    test('empty and missing sections are excluded', async () => {
        const text = await db.sections.create('text')
        const images = await db.sections.create('images')
        const files = await db.sections.create('files')
        const chart = await db.sections.create('chart')
        const video = await db.sections.create('video')
        if (chart.content.type !== 'chart' || video.content.type !== 'video'){
            throw new Error('impossible')
        }
        chart.content.data = []
        video.content.format = 'iframe_youtube'  // Still has no id
        for (const s of [chart, video]){
            await db.sections.set(s)
        }
        const msg = await create_message([[text.id], [images.id, files.id], [chart.id],
            [video.id, 'missing']], [{name: 'A', address: 'a@x.com'}])
        report_error.mockClear()
        await send_message(new Task('send_message', [msg.id], []))

        // Only text section remains and missing section reported
        const copy = (await db.copies.list_for_msg(msg.id))[0]!
        const published = await decrypt_copy(copy.id)
        expect(published.sections.map(row => row.map(s => s.id))).toEqual([[text.id]])
        expect(report_error).toHaveBeenCalledTimes(1)
        expect([...uploads.keys()].filter(k => k.startsWith('assets/'))).toEqual([])
    })

    // Invite links to an image only server can decrypt, and encrypts address for unsub links
    test('invite email has image url and encrypted address', async () => {
        const msg = await create_message([], [{name: 'A', address: 'a@x.com'}])
        await send_message(new Task('send_message', [msg.id], []))
        const copy = (await db.copies.list_for_msg(msg.id))[0]!
        const invite = parse_invite(emails[0]!.html)

        // Image url identifies copy and includes its server-side secret and the image format
        const sse64 = buffer_to_url64(await export_key(copy.secret_sse))
        expect(invite.image).toBe(`${profile.api}inviter/image?user=${profile.user}`
            + `&copy=${copy.id}&k=${sse64}&f=jpeg`)

        // Address can be decrypted with profile's secret
        const encrypted = url64_to_buffer(invite.unsub!.split(',unsub,')[1]!)
        const address = await decrypt_text(encrypted, profile.host_state.secret)
        expect(JSON.parse(address)).toEqual({address: 'a@x.com'})
    })

    // PNG invite images tell server to serve them as png
    test('png invite image is requested as png', async () => {
        native.files.set('Internal Files/invite.png', new ArrayBuffer(4))
        const msg = await create_message([], [{name: 'A', address: 'a@x.com'}], draft => {
            draft.options_identity.invite_image = 'invite.png'
        })
        await send_message(new Task('send_message', [msg.id], []))
        expect(parse_invite(emails[0]!.html).image).toMatch(/&f=png$/)
    })

    // Invite template is personalised for each contact
    test('invite template is filled with contact values', async () => {
        const msg = await create_message([], [{name: 'Bob Smith', address: 'b@x.com'}], draft => {
            draft.options_identity.invite_tmpl_email = `<p>${mention('contact_name')}|`
                + `${mention('msg_max_reads')}|${mention('unknown')}</p>`
        })
        await send_message(new Task('send_message', [msg.id], []))
        expect(emails[0]!.html).toContain(`<p>${mention('contact_name', 'Bob Smith')}|`
            + `${mention('msg_max_reads', '3')}|${mention('unknown', '-')}</p>`)
    })

    // Addresses are validated after trimming so stray whitespace doesn't prevent sending
    test('addresses with surrounding whitespace are still emailed', async () => {
        const msg = await create_message([], [{name: 'A', address: 'a@x.com'}])
        const copy = (await db.copies.list_for_msg(msg.id))[0]!
        const contact = (await db.contacts.get(copy.contact_id))!
        contact.address = ' a@x.com '
        await db.contacts.set(contact)
        await send_message(new Task('send_message', [msg.id], []))
        expect(emails.map(e => e.to.address)).toEqual([' a@x.com '])
    })

    // Copy for self is sent but not counted so user isn't confused by stated total
    test('copy for self is excluded from stated total', async () => {
        profile.options.send_to_self = 'yes'
        await db.profiles.set(profile)
        const msg = await create_message([], [{name: 'A', address: 'a@x.com'}])
        const task = new Task('send_message', [msg.id], [])
        await send_message(task)
        expect(emails.map(e => e.to.address).sort()).toEqual(['a@x.com', 'me@x.com'])
        expect(task.subtasks_total).toBe(1)
    })

    // Expired copies are neither uploaded nor emailed
    test('expired copies are skipped', async () => {
        const msg = await create_message([], [{name: 'A', address: 'a@x.com'},
            {name: 'B', address: 'b@x.com'}])
        const [expired, valid] = await db.copies.list_for_msg(msg.id)
        expired!.expired = true
        await db.copies.set(expired!)
        const task = new Task('send_message', [msg.id], [])
        await send_message(task)
        expect(emails.map(e => e.to.address)).toEqual([valid!.contact_address])
        expect(uploads.has(`copies/${expired!.id}`)).toBe(false)
        expect(task.subtasks_total).toBe(1)
    })

    // Copies whose contact was deleted still send using details stored in the copy
    test('copies of deleted contacts still send', async () => {
        const msg = await create_message([], [{name: 'A', address: 'a@x.com'}])
        const copy = (await db.copies.list_for_msg(msg.id))[0]!
        await db.contacts.remove(copy.contact_id)
        await send_message(new Task('send_message', [msg.id], []))
        expect(emails[0]!.to).toEqual({name: 'A', address: 'a@x.com'})
    })

    test('images, files and pages produce assets', async () => {
        native.files.set('Internal Files/i.png', new ArrayBuffer(4))
        native.files.set('Internal Files/j.png', new ArrayBuffer(8))
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
            {id: 'img2', data: 'j.png', caption: 'c2'}]
        single_file.content.files = [{data: 'f.pdf', name: 'doc', ext: '.pdf'}]
        multi_files.content.files = [{data: 'g.txt', name: 'a', ext: '.txt'},
            {data: 'g.txt', name: 'a', ext: '.txt'}, {data: 'g.txt', name: 'b', ext: '.txt'}]
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
        expect(published.sections[0]![0].content.type).toBe('images')
        expect(published.sections[1]![0].content).toMatchObject({type: 'files',
            filename: 'doc.pdf', download: false})
        expect(published.sections[1]![1]!.content).toMatchObject({type: 'files',
            filename: 'Bundle.zip', mimetype: 'application/zip', download: true})
        expect(published.sections[2]![0].content).toMatchObject({type: 'page', image: page.id,
            headline: 'More'})
        expect(published.sections[2]![0].respondable).toBe(false)

        // Images resized to fit section width with height limited by first image's ratio
        // NOTE Each image resized from own file, and page image limited to approx pagebait size
        const section_size = {max_width: SECTION_IMAGE_WIDTH,
            max_height: SECTION_IMAGE_WIDTH / 2, crop: true}
        expect(resize_calls).toEqual([
            {source_width: 200, ...section_size},
            {source_width: 400, ...section_size},
            {source_width: 200, max_width: 1000, max_height: 600, crop: true},
        ])

        // Images provided as both webp and jpeg
        expect(await decrypt_asset(msg.id, 'img1')).toBe('image/webp')
        expect(await decrypt_asset(msg.id, 'img1j')).toBe('image/jpeg')

        // Duplicate filenames in zip given unique names
        expect(await decrypt_asset(msg.id, multi_files.id))
            .toMatch(/^a\.txt\|a [\w-]+\.txt\|b\.txt$/)
    })

    // Pages without an image don't produce an image asset
    test('page without image has no image asset', async () => {
        const page = await db.sections.create('page')
        const msg = await create_message([[page.id]], [{name: 'A', address: 'a@x.com'}])
        await send_message(new Task('send_message', [msg.id], []))
        const copy = (await db.copies.list_for_msg(msg.id))[0]!
        const published = await decrypt_copy(copy.id)
        expect(published.sections[0]![0].content).toMatchObject({type: 'page', image: null})
        expect([...uploads.keys()].filter(k => k.startsWith('assets/'))).toEqual([])
    })

    test('resending skips copies already uploaded and invited', async () => {
        native.files.set('Internal Files/f.pdf', new ArrayBuffer(4))
        const files = await db.sections.create('files')
        if (files.content.type !== 'files'){
            throw new Error('impossible')
        }
        files.content.files = [{data: 'f.pdf', name: 'doc', ext: '.pdf'}]
        await db.sections.set(files)
        const msg = await create_message([[files.id]], [{name: 'A', address: 'a@x.com'},
            {name: 'B', address: 'b@x.com'}])
        email_result = async () => false  // First attempt fails for addresses
        await send_message(new Task('send_message', [msg.id], []))
        expect(emails).toHaveLength(2)
        expect(uploads.has(`assets/${msg.id}/${files.id}`)).toBe(true)
        const copy = (await db.copies.list_for_msg(msg.id))[0]!
        copy.invited = true
        await db.copies.set(copy)
        uploads.clear()
        email_result = async () => true
        const task = new Task('send_message', [msg.id], [])
        await send_message(task)
        expect(emails).toHaveLength(3)
        expect(uploads.size).toBe(0)  // All assets and copies uploaded already
        expect(task.subtasks_total).toBe(1)  // Only the uninvited copy
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
        const msg = await create_message([], [{name: 'Family', address: 'f@x.com'}], draft => {
            draft.options_identity.invite_tmpl_email = `<p>${mention('msg_max_reads')}</p>`
        })
        const copy = (await db.copies.list_for_msg(msg.id))[0]!
        const contact = (await db.contacts.get(copy.contact_id))!
        contact.multiple = true
        await db.contacts.set(contact)
        await send_message(new Task('send_message', [msg.id], []))
        expect(uploads.get(`copies/${copy.id}`)!.max_reads).toBe(Infinity)
        expect(emails[0]!.html).not.toContain(',unsub,')
        expect(emails[0]!.html).toContain(mention('msg_max_reads', '[unlimited]'))
        const published = await decrypt_copy(copy.id)
        expect(published.permission_subscription).toBe(false)
        expect(published.has_max_reads).toBe(false)
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
        expect(store.dispatch).toHaveBeenCalledWith('show_dialog', expect.objectContaining({
            props: {profile: expect.objectContaining({id: profile.id}) as unknown},
        }))

        // Can't fix settings if account was removed in the meantime
        await db.profiles.remove(profile.id)
        expect(await task.fix_settings!()).toBe("Sending account no longer exists")
        expect(store.dispatch).toHaveBeenCalledTimes(1)
    })

    // Upload failures are not swallowed
    test('upload failure is thrown after all copies processed', async () => {
        const msg = await create_message([], [{name: 'A', address: 'a@x.com'},
            {name: 'B', address: 'b@x.com'}])
        upload_hook = path => {
            if (path.startsWith('copies/')){
                throw new Error('upload failed')
            }
        }
        await expect(send_message(new Task('send_message', [msg.id], [])))
            .rejects.toThrow('upload failed')
    })

    test('updates host services and configs before sending if needed', async () => {
        const update = vi.spyOn(hosts, 'hosts_storage_update').mockResolvedValue()
        const configs_update = vi.spyOn(configs, 'configs_update').mockResolvedValue()

        // Neither called when already up-to-date
        const msg = await create_message([], [])
        await send_message(new Task('send_message', [msg.id], []))
        expect(update).not.toHaveBeenCalled()
        expect(configs_update).not.toHaveBeenCalled()

        // Both called for the message's profile when outdated
        profile.host_state.version = 1
        profile.host_state.displayer_config_uploaded = false
        await db.profiles.set(profile)
        await send_message(new Task('send_message', [msg.id], []))
        expect(update).toHaveBeenCalledTimes(1)
        expect(update.mock.calls[0]![0]).toMatchObject(
            {name: 'hosts_storage_update', params: [profile.id], options: []})
        expect(configs_update).toHaveBeenCalledTimes(1)
        expect(configs_update.mock.calls[0]![0]).toMatchObject(
            {name: 'configs_update', params: [profile.id], options: []})
    })

    test('aborts for missing message or profile', async () => {
        const missing_msg = send_message(new Task('send_message', ['missing'], []))
        await expect(missing_msg).rejects.toBeInstanceOf(TaskAborted)
        await expect(missing_msg).rejects.toThrow('no longer exists')
        const msg = await create_message([], [])
        await db.profiles.remove(profile.id)
        const missing_profile = send_message(new Task('send_message', [msg.id], []))
        await expect(missing_profile).rejects.toBeInstanceOf(TaskAborted)
        await expect(missing_profile).rejects.toThrow('no longer exists')
    })

    test('manual abort stops further copies', async () => {
        const msg = await create_message([], [{name: 'A', address: 'a@x.com'}])
        const task = new Task('send_message', [msg.id], [])
        task.abort()
        await expect(send_message(task)).rejects.toBeInstanceOf(TaskAborted)
        expect(emails).toHaveLength(0)
        expect(email.new_email_task).not.toHaveBeenCalled()  // Stopped before sending setup
    })

    // Abort during sending setup stops before any copy is uploaded
    test('abort before copies are uploaded stops uploads', async () => {
        const msg = await create_message([], [{name: 'A', address: 'a@x.com'}])
        const task = new Task('send_message', [msg.id], [])
        email_task_hook = () => task.abort()
        await expect(send_message(task)).rejects.toBeInstanceOf(TaskAborted)
        expect([...uploads.keys()].filter(k => k.startsWith('copies/'))).toEqual([])
    })

    // Abort while uploading a copy prevents its email being sent
    test('abort during copy upload stops email', async () => {
        const msg = await create_message([], [{name: 'A', address: 'a@x.com'}])
        const task = new Task('send_message', [msg.id], [])
        upload_hook = path => {
            if (path.startsWith('invite_images/')){
                task.abort()
            }
        }
        await expect(send_message(task)).rejects.toBeInstanceOf(TaskAborted)
        expect(emails).toHaveLength(0)
    })

    // Abort while emails are sending also aborts the email client
    test('abort during email sending aborts email client', async () => {
        const msg = await create_message([], [{name: 'A', address: 'a@x.com'}])
        const task = new Task('send_message', [msg.id], [])
        email_result = async () => {
            task.abort()
            return true
        }
        await send_message(task)
        expect(email_abort).toHaveBeenCalled()
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

        // Template falls back to empty if reply default is missing (known to happen)
        msg.draft.options_identity.invite_tmpl_email = ''
        profile.options.reply_invite_tmpl_email = undefined as unknown as string
        expect(sender.invite_tmpl_email).toBe('')
    })
})


describe('send_oauth_setup', () => {

    test('configures profile to send with oauth after test email', async () => {
        const oauth = await db.oauths.create({issuer: 'google', issuer_id: 'g',
            email: 'new@gmail.com', name: 'Oauth Name'} as OAuth)
        profile.msg_options_identity.sender_name = ''
        profile.smtp = {oauth: null, user: 'old', pass: profile.smtp.pass, host: 'smtp.x.com',
            port: 587, starttls: true}
        await db.profiles.set(profile)
        await send_oauth_setup(new Task('send_oauth_setup', [oauth.id, profile.id], []))
        const saved = (await db.profiles.get(profile.id))!
        expect(saved.email).toBe('new@gmail.com')
        expect(saved.host_state.responder_config_uploaded).toBe(false)
        expect(saved.msg_options_identity.sender_name).toBe('Oauth Name')

        // Old smtp settings fully replaced
        expect(saved.smtp).toEqual({oauth: oauth.id, user: '', pass: null, host: '', port: null,
            starttls: false})

        // Test email sent from and to the account itself
        expect(emails).toEqual([{
            id: 'none',
            from: {name: '', address: 'new@gmail.com'},
            to: {name: '', address: 'new@gmail.com'},
            subject: expect.stringMatching(/\S/) as unknown,
            html: expect.stringMatching(/^<p>.+<\/p>$/) as unknown,
        }])
    })

    // Existing email and sender name are kept when unchanged or already set
    test('preserves existing email state and sender name', async () => {
        const oauth = await db.oauths.create({issuer: 'google', issuer_id: 'g',
            email: 'me@x.com', name: 'Oauth Name'} as OAuth)
        await send_oauth_setup(new Task('send_oauth_setup', [oauth.id, profile.id], []))
        const saved = (await db.profiles.get(profile.id))!
        expect(saved.smtp.oauth).toBe(oauth.id)
        expect(saved.host_state.responder_config_uploaded).toBe(true)
        expect(saved.msg_options_identity.sender_name).toBe('Me')
    })

    test('aborts when missing records or test email fails', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const oauth = await db.oauths.create({issuer: 'google', issuer_id: 'g'} as OAuth)
        await expect(send_oauth_setup(new Task('', ['missing', profile.id], [])))
            .rejects.toThrow('Credentials missing')
        await expect(send_oauth_setup(new Task('', [oauth.id, 'missing'], [])))
            .rejects.toThrow('no longer exists')
        const error = new Error('cannot send')
        email_result = async () => {throw error}
        await expect(send_oauth_setup(new Task('', [oauth.id, profile.id], [])))
            .rejects.toThrow('cannot send email')
        expect(warn).toHaveBeenCalledWith(error)  // Underlying cause still logged for debugging
    })
})

// @vitest-environment happy-dom
// Generates compatibility fixtures from this version of the app (run via .bin/generate_compat)
// Other versions' tests must keep reading these, so data stored by existing users isn't broken
// See fixtures/compat/README.md

import {mkdirSync, writeFileSync} from 'fs'
import path from 'path'

import {test, vi} from 'vitest'

import app_config from '@/app_config.json'
import {setup_globals} from '@/../tests/unit_utils'
import {send_message} from './tasks/sending'
import {Task} from './tasks/tasks'
import * as email from './email/email'
import {external_encrypt} from './misc/external_crypt'
import {gen_view_url} from './misc/invites'
import {export_database} from './backup/database'
import {HOST_STORAGE_VERSION} from './hosts/common'
import {buffer_to_url64, utf8_to_string} from './utils/coding'
import {export_key} from './utils/crypt'
import type {HostUser} from './hosts/types'


// Image processing relies on browser apis, so replace with simple fakes (as in sending tests)
vi.mock('@/services/misc/images', () => ({
    resize_image: async (source:{width:number, height:number}) => ({
        width: source.width, height: source.height,
        convertToBlob: async (o:{type:string}) => new Blob([`image ${o.type}`], {type: o.type}),
    }),
}))


// Where fixtures for this version are written
const FIXTURE_DIR = path.resolve(import.meta.dirname, '../../../fixtures/compat',
    `v${app_config.version}`)


test.skipIf(!process.env['STELLO_COMPAT_GENERATE'])('generate app fixtures', async () => {
    const {db, native} = await setup_globals()
    vi.stubGlobal('createImageBitmap', async () => ({width: 200, height: 100}))

    // Profile ready to send
    const profile = await db.profiles.create()
    profile.setup_step = null
    profile.email = 'sender@example.com'
    profile.options.send_to_self = 'no'
    profile.msg_options_identity.sender_name = "Compat Sender"
    profile.host = {cloud: 'aws', bucket: 'compat', region: 'us-west-2', generated: {
        credentials: {accessKeyId: '', secretAccessKey: ''}, api_id: 'api'}}
    profile.host_state.version = HOST_STORAGE_VERSION
    profile.smtp.pass = await external_encrypt('password')
    await db.profiles.set(profile)
    const form = await db.subscribe_forms.create(profile.id)
    form.text = "Subscribe to compat"
    form.accept_message = true
    await db.subscribe_forms.set(form)

    // Capture everything uploaded to storage, as stored (string for text, url64 for binary)
    const storage:Record<string, string> = {}
    const binary = (path:string) => async (data:ArrayBuffer) => {
        storage[path] = buffer_to_url64(data)
    }
    vi.spyOn(db, 'new_host_user').mockImplementation(async () => ({
        upload_file: async (path:string, data:ArrayBuffer) => {
            storage[path] = buffer_to_url64(data)
        },
        upload_displayer_config: binary('config/displayer'),
        upload_responder_config: binary('config/responder'),
        upload_subscribe_config: async (config:string) => {
            storage['config/subscribe'] = config
        },
        update_email: async () => undefined,
    } as unknown as HostUser))
    let invite_html = ''
    vi.spyOn(email, 'new_email_task').mockImplementation(() => ({
        send: async (sent:{html:string}) => {
            invite_html = sent.html
            return true
        },
        abort: vi.fn(),
    }))

    // A message using every section type that produces content or assets
    native.files.set('Internal Files/i.png', new ArrayBuffer(4))
    native.files.set('Internal Files/f.pdf', new TextEncoder().encode("pdf").buffer)
    const text = await db.sections.create('text')
    const images = await db.sections.create('images')
    const file = await db.sections.create('files')
    const video = await db.sections.create('video')
    const chart = await db.sections.create('chart')
    const page = await db.sections.create('page')
    const page_text = await db.sections.create('text')
    if (text.content.type !== 'text' || images.content.type !== 'images'
            || file.content.type !== 'files' || video.content.type !== 'video'
            || page.content.type !== 'page' || page_text.content.type !== 'text'){
        throw new Error("impossible")
    }
    text.content.html = '<p>Hi <span data-mention="" data-id="contact_hello"></span>,'
        + ' <strong>compat</strong> text from <span data-mention="" data-id="sender_name">'
        + '</span></p>'
    images.content.images = [{id: 'img1', data: 'i.png', caption: "Caption one"},
        {id: 'img2', data: 'i.png', caption: "Caption two"}]
    file.content.files = [{data: 'f.pdf', name: 'doc', ext: '.pdf'}]
    video.content.format = 'iframe_youtube'
    video.content.id = 'abc123'
    page.content.headline = "Page headline"
    page.content.image = 'i.png'
    page_text.content.html = '<p>Text within a page</p>'
    page.content.sections = [[page_text.id]]
    for (const section of [text, images, file, video, chart, page, page_text]){
        await db.sections.set(section)
    }
    const [contact] = await db.contacts.create([{name: "Compat Recipient",
        address: 'recipient@example.com'}])
    const draft = await db.drafts.create()
    draft.profile = profile.id
    draft.title = "Compat message"
    draft.sections = [[text.id], [images.id], [file.id, video.id], [chart.id], [page.id]]
    draft.recipients.include_contacts = [contact!.id]
    await db.drafts.set(draft)
    const msg = await db.draft_to_message(draft.id)

    // Send (also uploads configs)
    await send_message(new Task('send_message', [msg.id], []))
    const copy = (await db.copies.list_for_msg(msg.id))[0]!
    const fresh_profile = (await db.profiles.get(profile.id))!

    // Write fixture
    const view_url = await gen_view_url(copy, fresh_profile)
    const fixture = {
        version: app_config.version,
        keys: {
            shared_secret: buffer_to_url64(await export_key(fresh_profile.host_state.shared_secret)),
            secret: buffer_to_url64(await export_key(fresh_profile.host_state.secret)),
            resp_key_public: buffer_to_url64(
                await export_key(fresh_profile.host_state.resp_key.publicKey)),
        },
        ids: {profile: profile.id, msg: msg.id, copy: copy.id, contact: contact!.id,
            form: form.id, resp_token: copy.resp_token, sections: {text: text.id,
                images: images.id, file: file.id, video: video.id, chart: chart.id,
                page: page.id}},
        view_hash: view_url.split('#')[1],
        // Address encrypted for unsubscribe/change address links in invite emails
        encrypted_address: /,unsub,([^'"&]+)/.exec(invite_html)![1],
        storage,
        backup: utf8_to_string(await export_database()),
    }
    mkdirSync(FIXTURE_DIR, {recursive: true})
    writeFileSync(path.join(FIXTURE_DIR, 'app.json'), JSON.stringify(fixture, null, 4) + '\n')
})

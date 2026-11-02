
// Seed helpers that run INSIDE the browser for app/tests/e2e (imported via Vite dev server)
// NOTE Data is deterministic so tests can rely on names/counts

import {HOST_STORAGE_VERSION} from '@/services/hosts/common'
import {external_encrypt} from '@/services/misc/external_crypt'
import {default_invite_image, blobstore_new} from '@/services/database/blobstore'
import {Draft} from '@/services/database/drafts'
import {generate_key_sym, encrypt_sym, export_key} from '@/services/utils/crypt'
import {buffer_to_url64, string_to_utf8} from '@/services/utils/coding'

import type {RecordProfileHost} from '@/services/database/types'


// Fake host that points at an S3 bucket which Playwright intercepts (never reaches AWS)
const FAKE_HOST:RecordProfileHost = {
    cloud: 'aws',
    bucket: 'stello-e2e',
    region: 'us-west-2',
    generated: {
        credentials: {accessKeyId: 'AKIAE2E', secretAccessKey: 'e2e-secret'},
        api_id: 'e2eapi',
    },
}


export interface SeedResult {
    profile:string
    contacts:string[]
    groups:string[]
    draft:string
    messages:string[]
    sections:Record<string, string>
}


export async function seed_state(values:Record<string, unknown>):Promise<void>{
    // Set raw app state values (store reads these on next load)
    for (const [key, value] of Object.entries(values)){
        await self.app_db.state.set({key, value} as never)
    }
}


export async function seed_profile(setup_complete=true):Promise<string>{
    // Create a profile using the fake host (optionally fully set up)
    const db = self.app_db
    const profile = await db.profiles.create()
    profile.email = 'sender@example.com'
    profile.smtp = {
        oauth: null,
        host: 'localhost',
        port: 25,
        user: 'user',
        pass: await external_encrypt('pass'),
        starttls: true,
    }
    profile.msg_options_identity.sender_name = "Sender Name"
    if (setup_complete){
        profile.host = FAKE_HOST
        profile.setup_step = null
        profile.host_state.version = HOST_STORAGE_VERSION
        profile.host_state.displayer_config_uploaded = true
        profile.host_state.subscribe_config_uploaded = true
        profile.host_state.responder_config_uploaded = true
    }
    await db.profiles.set(profile)
    await db.state.set({key: 'default_profile', value: profile.id})
    return profile.id
}


export async function seed_full():Promise<SeedResult>{
    // Create a complete set of data covering most record types
    const db = self.app_db
    const profile_id = await seed_profile()

    // Contacts (some without addresses) and groups
    const names = ['Adam Andrews', 'Ben Beaver', 'Charlie Chapman', 'David Driver',
        'Edward Edmonds', 'Fred Fudge', 'Greg Goods', 'Harry Harvard']
    const contacts = await db.contacts.create(names.map((name, i) => ({
        name,
        address: i === 7 ? '' : `contact${i}@example.com`,
        notes: i === 0 ? "Some notes" : '',
    })))
    const friends = await db.groups.create('Friends', contacts.slice(0, 3).map(c => c.id))
    const family = await db.groups.create('Family', contacts.slice(3, 5).map(c => c.id))

    // Unsubscribe one contact and request address change for another
    await db.unsubscribes.set({profile: profile_id, contact: contacts[6]!.id, sent: new Date(),
        ip: null, user_agent: null})
    await db._conn.put('request_address', {contact: contacts[5]!.id,
        new_address: 'new5@example.com', old_address: contacts[5]!.address, sent: new Date(),
        ip: null, user_agent: null})

    // Sections of every type
    const image_blob = await default_invite_image()
    const text = await db.sections.create_object({type: 'text',
        html: '<p>Hello <strong>world</strong>, this is a test message.</p>', standout: null})
    const images = await db.sections.create_object({type: 'images', images: [
        {id: 'img1', data: await blobstore_new(image_blob), caption: "First image"},
        {id: 'img2', data: await blobstore_new(image_blob), caption: "Second image"},
    ], crop: true, hero: false})
    const video = await db.sections.create_object({type: 'video', format: 'iframe_youtube',
        id: '8wF2hoZ-tYA', caption: "A video", start: null, end: null})
    const chart = await db.sections.create_object({type: 'chart', chart: 'bar',
        title: "Example Chart", caption: "Chart caption", threshold: '10', data: [
            {id: '1', label: "Fuel", number: '8', hue: 0},
            {id: '2', label: "Food", number: '5', hue: 180},
        ]})
    const files = await db.sections.create_object({type: 'files', label: "Download file",
        files: [{data: await blobstore_new(image_blob), name: "Example", ext: '.jpg'}]})
    const sub_text = await db.sections.create_object({type: 'text',
        html: '<p>Text inside a page</p>', standout: 'distinct'})
    const page = await db.sections.create_object({type: 'page', button: true,
        headline: "A page headline", desc: "A page description", image: null,
        sections: [[sub_text.id]]})
    for (const section of [text, images, video, chart, files, sub_text, page]){
        await db.sections.set(section)
    }

    // Draft using all the sections
    const draft = await db.drafts.create_object()
    draft.title = "Seeded draft"
    draft.profile = profile_id
    draft.sections = [[text.id, images.id], [video.id], [chart.id, files.id], [page.id]]
    draft.recipients.include_contacts = [contacts[0]!.id, contacts[1]!.id, contacts[7]!.id]
    draft.recipients.include_groups = [friends.id]
    await db.drafts.set(draft)

    // Template draft
    const template = await db.drafts.create_object(true)
    template.title = "Seeded template"
    await db.drafts.set(template)

    // Sent messages (copies made of draft, then converted)
    const messages = []
    for (const title of ["First message", "Second message"]){
        const copy = await db.draft_copy(new Draft({...draft, title, reply_to: 'id'} as Draft))
        const msg = await db.draft_to_message(copy.id)
        messages.push(msg)
    }

    // Mark first message's copies as invited and add responses to them
    const copies = await db.copies.list_for_msg(messages[0]!.id)
    const sent = new Date('2026-01-02T03:04:05Z')
    for (const [i, copy] of copies.entries()){
        copy.invited = true
        await db.copies.set(copy)
        // NOTE Distinct times (a minute apart) so responses always list in the same order
        const at = (offset:number) => new Date(sent.getTime() + (i * 3 + offset) * 60 * 1000)
        await db.read_create(at(0), copy.resp_token, null, '')
        await db.reply_create(`General reply ${i}`, at(1), copy.resp_token, null, null, null, '')
        await db.reply_create(`Section reply ${i}`, at(2), copy.resp_token, text.id, null, null,
            '')
        await db.reaction_create('love', at(2), copy.resp_token, images.id, 'img1', null, '')
    }

    // Resend request and subscription request
    await db._conn.put('request_resend', {contact: copies[0]!.contact_id,
        message: messages[0]!.id, reason: "Please resend", sent, ip: null, user_agent: null})
    const form = await db.subscribe_forms.create(profile_id)
    await db._conn.put('request_subscribe', {id: 'sub1', name: "Sub Scriber",
        address: 'sub@example.com', message: "Please add me", profile: profile_id,
        groups: [friends.id], service_account: null, sent, ip: null, user_agent: null})

    return {
        profile: profile_id,
        contacts: contacts.map(c => c.id),
        groups: [friends.id, family.id],
        draft: draft.id,
        messages: messages.map(m => m.id),
        sections: {text: text.id, images: images.id, video: video.id, chart: chart.id,
            files: files.id, page: page.id, form: form.id},
    }
}


export async function make_storage_code(bucket:string):Promise<{code:string, body:number[]}>{
    // Generate a third-party storage code and the encrypted credentials it refers to
    const key = await generate_key_sym(true, ['encrypt', 'decrypt'])
    const credentials = {
        cloud: 'aws',
        bucket,
        region: 'us-west-2',
        generated: {
            credentials: {accessKeyId: 'AKIACODE', secretAccessKey: 'code-secret'},
            api_id: 'codeapi',
        },
    }
    const encrypted = await encrypt_sym(string_to_utf8(JSON.stringify(credentials)), key)
    return {
        code: `stello:aws:${bucket}:${buffer_to_url64(await export_key(key))}`,
        body: [...new Uint8Array(encrypted)],
    }
}

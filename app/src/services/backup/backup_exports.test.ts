// @vitest-environment happy-dom
// Tests for backup/contacts, backup/replies, backup/drafts and backup/generic

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import papaparse from 'papaparse'

import {setup_globals, MemoryNative} from '@/../tests/unit_utils'
import {Database} from '../database/database'
import {export_contacts_csv, backup_contacts, save_contacts_to_dir} from './contacts'
import {export_replies_csv, save_replies_to_dir} from './replies'
import {draft_to_html, save_draft, save_drafts_to_dir, save_messages_to_dir} from './drafts'
import {save_all_messages, run_database_backup, run_backups} from './generic'
import * as drafts_module from './drafts'
import * as replies_module from './replies'
import * as contacts_module from './contacts'
import {utf8_to_string} from '../utils/coding'
import type {RecordReplaction} from '../database/types'


let db:Database
let native:MemoryNative

beforeEach(async () => {
    ({db, native} = await setup_globals({dbid: 'db1'}))
    await db.state.set({key: 'dbid', value: 'db1'})
})

afterEach(() => {
    vi.restoreAllMocks()
})


// Parse CSV ArrayBuffer to rows
const parse_csv = (buffer:ArrayBuffer) => papaparse.parse<string[]>(utf8_to_string(buffer)).data
const file_text = (path:string) => utf8_to_string(native.files.get(path)!)


describe('contacts csv', () => {

    test('includes unsubscribe columns per profile', async () => {
        const profile = await db.profiles.create()
        const [a, b] = await db.contacts.create([{name: 'A', address: 'a@x', notes: 'n'},
            {name: 'B'}])
        a!.multiple = true
        await db.unsubscribes.set({profile: profile.id, contact: b!.id, sent: new Date(),
            ip: null, user_agent: null})
        const rows = parse_csv(export_contacts_csv([a!, b!], await db.unsubscribes.list(),
            [profile]))
        expect(rows[0]).toEqual(['Name', 'Email', 'Notes', 'Greet as', 'Is mailing list',
            'Unsubscribed (New Account)'])
        expect(rows[1]).toEqual(['A', 'a@x', 'n', '', 'True', ''])
        expect(rows[2]).toEqual(['B', '', '', '', '', 'Unsubscribed'])
    })

    test('save_contacts_to_dir writes group files and all contacts', async () => {
        const [a] = await db.contacts.create([{name: 'A'}, {name: 'B'}])
        await db.contacts.create({name: 'Synced', service_account: 'google:1'})
        await db.groups.create('Fam/ily', [a!.id])
        await db.groups.create('Synced group', [], 'google:1')
        await save_contacts_to_dir('dir')
        expect([...native.files.keys()].sort()).toEqual(['dir/All Contacts.csv',
            'dir/Family.csv'])
        expect(parse_csv(native.files.get('dir/All Contacts.csv')!)).toHaveLength(3)
        expect(parse_csv(native.files.get('dir/Family.csv')!)).toHaveLength(2)
    })

    test('save_contacts_to_dir skips when no contacts', async () => {
        await save_contacts_to_dir('dir')
        expect(native.files.size).toBe(0)
    })

    test('backup_contacts rotates old backups', async () => {
        await db.contacts.create({name: 'A'})
        const dir = 'Backups [db1]/Contacts'
        for (const date of ['2020-01-01', '2020-02-01', '2020-03-01']){
            native.files.set(`${dir}/${date}/All Contacts.csv`, new ArrayBuffer(1))
        }
        await backup_contacts()
        const today = new Date().toISOString().slice(0, 10)
        expect(native.files.has(`${dir}/${today}/All Contacts.csv`)).toBe(true)
        expect(native.removed).toEqual([`${dir}/2020-01-01`])
        // Running again same day does nothing
        native.removed = []
        await backup_contacts()
        expect(native.removed).toEqual([])
    })
})


describe('replies csv', () => {

    // Create a reply with given content
    async function reply(content:string, extra:Partial<RecordReplaction>={}){
        await db.replies.set({id: content, sent: new Date(2020, 0, 1), ip: null, user_agent: '',
            copy_id: null, msg_id: null, msg_title: 'Msg', contact_id: null, contact_name: 'Bob',
            section_id: null, subsection_id: null, content, read: false, replied: false,
            archived: false, ...extra})
    }

    test('exports replies newest first', async () => {
        await reply('old')
        await reply('new', {sent: new Date(2021, 0, 1), section_id: 's', replied: true,
            archived: true})
        await save_replies_to_dir('dir')
        const rows = parse_csv(native.files.get('dir/Replies.csv')!)
        expect(rows[0]![0]).toBe('Name')
        expect(rows[1]).toEqual(['Bob', 'new', new Date(2021, 0, 1).toLocaleString(), 'Msg',
            'Comment on section', 'yes', 'yes'])
        expect(rows[2]![4]).toBe('Reply to message')
    })

    test('recipient content cannot inject spreadsheet formulas', async () => {
        // Replies are untrusted, so values a spreadsheet could execute must be escaped
        await reply('=HYPERLINK("https://evil","click")')
        const rows = parse_csv(await export_replies_csv())
        expect(rows[1]![1]!.startsWith('=')).toBe(false)
    })
})


describe('drafts export', () => {

    test('draft_to_html renders sections, pages, variables and theme', async () => {
        const profile = await db.profiles.create()
        profile.msg_options_identity.sender_name = 'Profile Name'
        profile.options.theme_style = 'formal'
        await db.profiles.set(profile)
        native.files.set('Internal Files/i.webp', new ArrayBuffer(2))

        const text = await db.sections.create('text')
        const video = await db.sections.create('video')
        const images = await db.sections.create('images')
        const files = await db.sections.create('files')
        const page = await db.sections.create('page')
        const sub = await db.sections.create('text')
        if (text.content.type !== 'text' || video.content.type !== 'video'
                || images.content.type !== 'images' || page.content.type !== 'page'
                || sub.content.type !== 'text'){
            throw new Error('impossible')
        }
        text.content.html = '<p>From <span data-mention="" data-id="sender_name"></span></p>'
        video.content.format = 'iframe_youtube'
        video.content.id = 'vid'
        video.content.caption = '<cap>'
        images.content.images = [{id: 'i1', data: 'i.webp', caption: 'Pic'},
            {id: 'i2', data: 'missing.png', caption: 'Missing'}]
        sub.content.html = '<p>Subpage</p>'
        page.content.sections = [[sub.id]]
        for (const s of [text, video, images, sub, page]){
            await db.sections.set(s)
        }
        const draft = await db.drafts.create()
        draft.title = 'Title <b>'
        draft.profile = profile.id
        draft.sections = [[text.id], [video.id, page.id], [images.id, files.id], ['missing']]
        vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const html = await draft_to_html(draft, undefined, new Date(2020, 0, 1), undefined,
            'All contacts')
        expect(html).toContain('<title>Title &lt;b&gt;</title>')
        expect(html).toContain('style-formal')
        expect(html).toContain('>Profile Name<')
        expect(html).toContain('https://www.youtube.com/watch?v=vid')
        expect(html).toContain('&lt;cap&gt;')
        expect(html).toContain('data:image/webp;base64,')
        expect(html).toContain('Pic')
        expect(html).not.toContain('Missing')
        expect(html.indexOf('Subpage')).toBeGreaterThan(html.indexOf('Pic'))  // Pages at end
        expect(html).toContain('Recipients: All contacts')
    })

    test('save_draft downloads html or requests pdf', async () => {
        const draft = await db.drafts.create()
        draft.title = 'My/Draft'
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
        await save_draft('html', draft)
        expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('MyDraft.html')
        const pdf = vi.spyOn(native, 'html_to_pdf')
        await save_draft('pdf', draft)
        expect(pdf).toHaveBeenCalledWith(expect.stringContaining('<html>'), 'MyDraft')
    })

    test('save_drafts_to_dir wipes dir and reports failures', async () => {
        native.files.set('dir/stale.html', new ArrayBuffer(1))
        const good = await db.drafts.create()
        good.title = 'Good'
        await db.drafts.set(good)
        const bad = await db.drafts.create()
        bad.title = 'Bad'
        bad.sections = null as never  // Corrupt
        await db.drafts.set(bad)
        const failed = await save_drafts_to_dir('dir')
        expect(failed).toEqual(['Bad'])
        expect([...native.files.keys()]).toEqual([`dir/Good [${good.id.slice(0, 6)}].html`])
    })

    test('save_messages_to_dir only renders new messages and removes deleted', async () => {
        const profile = await db.profiles.create()
        profile.options.send_to_self = 'no'
        await db.profiles.set(profile)
        const create_msg = async (title:string, reply_to:string|null=null) => {
            const draft = await db.drafts.create()
            draft.title = title
            draft.profile = profile.id
            draft.reply_to = reply_to
            await db.drafts.set(draft)
            return db.draft_to_message(draft.id)
        }
        const original = await create_msg('Original')
        const reply = await create_msg('Reply', 'r1')
        native.files.set('sent/Deleted [abcdef].html', new ArrayBuffer(1))
        const render = vi.spyOn(db, 'draft_recipients_descriptor')
        expect(await save_messages_to_dir('sent', 'replies')).toEqual([])
        expect(native.files.has(`sent/Original [${original.id.slice(0, 6)}].html`)).toBe(true)
        expect(native.files.has(`replies/Reply [${reply.id.slice(0, 6)}].html`)).toBe(true)
        expect(native.files.has('sent/Deleted [abcdef].html')).toBe(false)
        expect(render).toHaveBeenCalledTimes(1)

        // Second run doesn't re-render existing
        const write = vi.spyOn(native, 'user_file_write')
        await save_messages_to_dir('sent', 'replies')
        expect(write).not.toHaveBeenCalled()
    })
})


describe('generic', () => {

    test('run_database_backup writes database json', async () => {
        await db.contacts.create({name: 'A'})
        const buffer = await run_database_backup()
        expect(JSON.parse(file_text('Backups [db1]/database.json'))).toMatchObject(
            {version: 1, dbid: 'db1'})
        expect(buffer.byteLength).toBeGreaterThan(0)
    })

    test('save_all_messages collects failures from each step', async () => {
        vi.spyOn(replies_module, 'save_replies_to_dir').mockRejectedValue(new Error())
        vi.spyOn(drafts_module, 'save_drafts_to_dir').mockResolvedValue(['Draft A'])
        vi.spyOn(drafts_module, 'save_messages_to_dir').mockRejectedValue(new Error())
        expect(await save_all_messages('dir')).toEqual(["*Responses from recipients*",
            'Draft A', "*Sent Messages*"])
        expect(self.app_report_error).toHaveBeenCalledTimes(2)
    })

    test('run_backups respects setting and reports errors silently', async () => {
        const contacts = vi.spyOn(contacts_module, 'backup_contacts').mockRejectedValue(
            new Error('contacts'))
        const replies = vi.spyOn(replies_module, 'save_replies_to_dir').mockResolvedValue()
        vi.spyOn(drafts_module, 'save_drafts_to_dir').mockResolvedValue([])
        vi.spyOn(drafts_module, 'save_messages_to_dir').mockResolvedValue([])
        await run_backups('none')
        expect(contacts).not.toHaveBeenCalled()
        await run_backups('contacts')
        expect(contacts).toHaveBeenCalledTimes(1)
        expect(replies).not.toHaveBeenCalled()
        await run_backups('all')
        expect(replies).toHaveBeenCalledWith('Backups [db1]/Responses')
        expect(self.app_report_error).toHaveBeenCalledTimes(2)
    })
})

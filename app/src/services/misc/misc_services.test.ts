// @vitest-environment happy-dom
// Tests for misc/invites, misc/templates, misc/vcard, misc/external_crypt, misc/images

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {setup_globals} from '@/../tests/unit_utils'
import {Database} from '@/services/database/database'
import {gen_invite_styles, render_invite_html, render_invite_text, get_text_invite_for_copy,
    gen_view_url, INVITE_IMG_HEIGHT} from './invites'
import {gen_variable_items, update_template_values, msg_max_reads_value} from './templates'
import {extract_contacts_from_vcard} from './vcard'
import {external_encrypt, external_decrypt} from './external_crypt'
import {resize_image} from './images'
import {MustReauthenticate} from '@/services/utils/exceptions'
import {string_to_utf8} from '@/services/utils/coding'


let db:Database

beforeEach(async () => {
    ({db} = await setup_globals())
})


describe('invites', () => {

    test('gen_invite_styles uses hex colors for hue', () => {
        const styles = gen_invite_styles(120)
        expect(styles.button).toMatch(/background-color: #[0-9a-f]{6}/)
        expect(styles.image).toContain(`max-height: ${INVITE_IMG_HEIGHT}px`)
    })

    test('render_invite_html escapes attributes and button', () => {
        const html = render_invite_html('<p>Contents</p>', "https://x/#a'b", 'https://img/',
            '<Open>', 100)
        expect(html).toContain('<p>Contents</p>')
        expect(html).toContain("href='https://x/#a&#39;b'")
        expect(html).toContain('&lt;Open&gt;')
        expect(html).not.toContain('Unsubscribe')
    })

    test('render_invite_html adds subscription links when address given', () => {
        const html = render_invite_html('', 'https://x/#a', 'img', 'Open', 100, 'enc')
        expect(html).toContain('https://x/#a,unsub,enc')
        expect(html).toContain('https://x/#a,address,enc')
    })

    test('render_invite_text replaces placeholders', () => {
        const text = render_invite_text('Hi CONTACT, SENDER sent SUBJECT\nLINK', {
            contact: 'Bob', sender: 'Alice', title: 'News', url: 'https://x/'})
        expect(text).toBe('Hi Bob, Alice sent News\n https://x/')
    })

    test('render_invite_text appends url if no placeholder', () => {
        expect(render_invite_text('Hello', {contact: '', sender: '', title: '',
            url: 'https://x/'})).toBe('Hello\n\nhttps://x/')
    })

    test('render_invite_text keeps $ sequences in values', () => {
        // `$` sequences in values must be inserted literally
        const text = render_invite_text('SUBJECT LINK', {contact: '', sender: '',
            title: 'Raised $$$ for $&', url: 'https://x/'})
        expect(text).toBe('Raised $$$ for $&  https://x/')  // LINK is padded with spaces
    })

    test('get_text_invite_for_copy and gen_view_url', async () => {
        const profile = await db.profiles.create()
        profile.host = {cloud: 'aws', bucket: 'b', region: 'r', generated: {credentials:
            {accessKeyId: '', secretAccessKey: ''}}}
        profile.msg_options_identity.sender_name = 'Profile Sender'
        await db.profiles.set(profile)
        const contact = await db.contacts.create({name: 'Bob Smith', address: 'b@x'})
        const draft = await db.drafts.create()
        draft.profile = profile.id
        draft.title = 'Subject'
        draft.recipients.include_contacts = [contact.id]
        await db.drafts.set(draft)
        const msg = await db.draft_to_message(draft.id)
        const copy = (await db.copies.list_for_msg(msg.id)).find(c => c.contact_id === contact.id)!

        const url = await gen_view_url(copy, profile)
        expect(url).toMatch(new RegExp(`^https://b.s3-r.amazonaws.com/_#[^,]+,${copy.id},[^,]+$`))
        const text = await get_text_invite_for_copy(copy)
        expect(text).toContain('Hi Bob, please see below')
        expect(text).toContain('Regards, Profile Sender')
        expect(text).toContain('Subject')
        expect(text).toContain(url)
    })
})


describe('templates', () => {

    test('gen_variable_items with and without expiry', () => {
        const published = new Date(2020, 0, 1, 13, 5)
        const items = gen_variable_items('Bob', 'Bob Smith', 'Alice', 'Title', published, 3, 7)
        expect(items['contact_hello']!.value).toBe('Bob')
        expect(items['msg_max_reads']!.value).toBe('3')
        expect(items['msg_lifespan']!.value).toBe('7 days')
        expect(items['msg_expires_date']!.value).toBe(new Date(2020, 0, 8).toLocaleDateString())
        const forever = gen_variable_items(null, null, null, null, published, Infinity, Infinity)
        expect(forever['msg_max_reads']!.value).toBe('[unlimited]')
        expect(forever['msg_lifespan']!.value).toBe('[no expiry]')
    })

    test('msg_max_reads_value', () => {
        expect(msg_max_reads_value(Infinity)).toBe('[unlimited]')
        expect(msg_max_reads_value(5)).toBe('5')
    })

    test('update_template_values replaces known and optionally empties unknown', () => {
        const html = '<p><span data-mention="" data-id="a">old</span>'
            + '<span data-mention="" data-id="b">old</span></p>'
        const partial = update_template_values(html, {a: {value: 'new'}})
        expect(partial).toContain('>new<')
        expect(partial).toContain('data-id="b">old<')
        const emptied = update_template_values(html, {a: {value: null}}, '-')
        expect(emptied).toBe('<p><span data-mention="" data-id="a">-</span>'
            + '<span data-mention="" data-id="b">-</span></p>')
    })
})


describe('vcard', () => {

    test('extracts names, first email and notes', () => {
        const data = [
            'BEGIN:VCARD',
            'VERSION:3.0',
            'FN:Bob Smith',
            'item1.EMAIL;TYPE=INTERNET:bob@x.com',
            'EMAIL:second@x.com',
            'NOTE:Likes cake\\, a lot',
            'END:VCARD',
            'BEGIN:VCARD',
            'FN:No Email',
            'END:VCARD',
            'BEGIN:VCARD',
            'TEL:123',
            'END:VCARD',
            'FN:Outside card',
        ].join('\r\n')
        expect(extract_contacts_from_vcard(data)).toEqual([
            {name: 'Bob Smith', email: 'bob@x.com', notes: 'Likes cake, a lot'},
            {name: 'No Email', email: null, notes: null},
        ])
    })

    test('unfolds long lines', () => {
        // RFC 6350 folds lines >75 chars with CRLF + space (Google does this)
        const data = 'BEGIN:VCARD\r\nFN:Bob\r\nNOTE:This is a long note that has been\r\n'
            + '  folded onto a second line\r\nEND:VCARD'
        expect(extract_contacts_from_vcard(data)[0]!.notes)
            .toBe('This is a long note that has been folded onto a second line')
    })

    test('unescapes newlines and semicolons', () => {
        // BUG #vcard-escapes: only `\,` is unescaped, but `\n`, `\;` and `\\` are also standard
        const data = 'BEGIN:VCARD\nFN:Bob\nNOTE:Line one\\nLine two\\; ok\nEND:VCARD'
        expect(extract_contacts_from_vcard(data)[0]!.notes).toBe('Line one\nLine two; ok')
    })
})


describe('external_crypt', () => {

    test('uses OS encryption when available', async () => {
        self.app_native.os_encrypt = async (secret:string) => string_to_utf8(`os:${secret}`)
        self.app_native.os_decrypt = async (buffer:ArrayBuffer) =>
            new TextDecoder().decode(buffer).slice(3)
        const encrypted = await external_encrypt('pw')
        expect(new TextDecoder().decode(encrypted)).toBe('os:pw')
        expect(await external_decrypt(encrypted)).toBe('pw')
        expect(self.app_store.state.fallback_secret).toBe(null)
    })

    test('falls back to own secret when OS encryption unavailable', async () => {
        const encrypted = await external_encrypt('pw')
        expect(self.app_store.state.fallback_secret).not.toBe(null)
        expect(self.app_report_error).toHaveBeenCalledTimes(1)
        expect(await external_decrypt(encrypted)).toBe('pw')
        // Second encryption reuses the fallback secret without reporting again
        await external_encrypt('pw2')
        expect(self.app_report_error).toHaveBeenCalledTimes(1)
    })

    test('decrypt failure throws MustReauthenticate', async () => {
        await expect(external_decrypt(new ArrayBuffer(4))).rejects.toThrow(MustReauthenticate)
        await external_encrypt('x')  // Creates fallback secret
        await expect(external_decrypt(new ArrayBuffer(40))).rejects.toThrow(MustReauthenticate)
    })
})


describe('resize_image', () => {

    test('returns canvas unchanged when no resize needed', async () => {
        class FakeCanvas {
            constructor(public width:number, public height:number){}
            getContext(){return {transferFromImageBitmap(){}, drawImage(){}}}
        }
        vi.stubGlobal('OffscreenCanvas', FakeCanvas)
        const canvas = new FakeCanvas(10, 10) as unknown as OffscreenCanvas
        expect(await resize_image(canvas, 100, 100)).toBe(canvas)
        const bitmap = {width: 10, height: 10} as ImageBitmap
        expect((await resize_image(bitmap, 100, 100)).width).toBe(10)
        vi.unstubAllGlobals()
    })
})

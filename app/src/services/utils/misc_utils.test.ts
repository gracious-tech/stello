// @vitest-environment happy-dom
// Tests for utils/iteration, utils/misc, utils/numbers, utils/objects, utils/strings

import {afterEach, describe, expect, test, vi} from 'vitest'

import {range, cycle, percent} from './iteration'
import {get_clipboard_blobs, get_clipboard_text, email_address_like, download_file, download_url,
    mailto} from './misc'
import {enforce_range, parse_int, parse_float} from './numbers'
import {nested_objects_set, nested_objects_update, NestedKeyMissing, NestedStructureChanged}
    from './objects'
import {partition, replace_without_overlap, escape_for_html, str_or_null, sanitize_filename}
    from './strings'


afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})


describe('iteration', () => {

    test('range with amount', () => {
        expect([...range(3)]).toEqual([0, 1, 2])
    })

    test('range with start, end and step', () => {
        expect([...range(2, 10, 3)]).toEqual([2, 5, 8])
    })

    test('cycle repeats options endlessly', () => {
        const gen = cycle(['a', 'b'])
        expect([gen.next().value, gen.next().value, gen.next().value]).toEqual(['a', 'b', 'a'])
    })

    test('percent yields roughly given portion', () => {
        expect([...percent([1, 2, 3, 4], 0.5)]).toHaveLength(2)
        expect([...percent([1, 2, 3, 4], 0)]).toHaveLength(0)
        expect([...percent([1, 2, 3, 4], 1)]).toHaveLength(4)
    })
})


describe('misc', () => {

    test('email_address_like', () => {
        expect(email_address_like('a@b')).toBe(true)
        expect(email_address_like('a@b.com')).toBe(true)
        expect(email_address_like('a b@c')).toBe(false)
        expect(email_address_like('ab.com')).toBe(false)
        expect(email_address_like('a@@b')).toBe(false)
    })

    test('mailto encodes and limits length', () => {
        expect(mailto('a@b', 'Hi there', 'x&y')).toBe('mailto:a@b?subject=Hi%20there&body=x%26y')
        expect(mailto()).toBe('mailto:?subject=&body=')
        expect(mailto('a@b', '', 'x'.repeat(5000))).toHaveLength(1900)
    })

    test('download_url clicks a temporary anchor', () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
        download_url('https://x/file', 'name.txt')
        expect(click).toHaveBeenCalledTimes(1)
        expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('name.txt')
    })

    test('download_file uses object url and file name', () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
        download_file(new File(['x'], 'f.txt'))
        const anchor = click.mock.contexts[0] as HTMLAnchorElement
        expect(anchor.download).toBe('f.txt')
        expect(anchor.href).toMatch(/^blob:/)
    })

    test('get_clipboard_blobs prefers given types and skips failures', async () => {
        const item = {
            types: ['text/html', 'image/png'],
            getType: vi.fn(async (type:string) => new Blob(['x'], {type})),
        }
        const bad_item = {
            types: ['text/plain'],
            getType: vi.fn(async () => {throw new Error()}),
        }
        vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(
            {read: async () => [item, bad_item]} as unknown as Clipboard)
        const blobs = await get_clipboard_blobs(['image/'])
        expect(blobs.map(b => b.type)).toEqual(['image/png'])
    })

    test('get_clipboard_blobs returns empty when read fails', async () => {
        vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(
            {read: async () => {throw new Error()}} as unknown as Clipboard)
        expect(await get_clipboard_blobs()).toEqual([])
    })

    test('get_clipboard_text returns text', async () => {
        vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(
            {readText: async () => 'abc'} as unknown as Clipboard)
        expect(await get_clipboard_text()).toBe('abc')
    })

    test('get_clipboard_text returns null when reading rejects', async () => {
        // Rejections from reading the clipboard should result in null
        vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(
            {readText: () => Promise.reject(new DOMException('denied'))} as unknown as Clipboard)
        await expect(get_clipboard_text()).resolves.toBe(null)
    })
})


describe('numbers', () => {

    test('enforce_range clamps and defaults', () => {
        expect(enforce_range(5, 1, 10)).toBe(5)
        expect(enforce_range(-5, 1, 10)).toBe(1)
        expect(enforce_range(50, 1, 10)).toBe(10)
        expect(enforce_range('5', 1, 10)).toBe(1)
        expect(enforce_range(null, 1, 10, 7)).toBe(7)
        expect(enforce_range(Infinity, 1, 10)).toBe(10)
    })

    test('enforce_range never returns NaN', () => {
        // NaN is typeof 'number' but must not pass through clamping
        expect(enforce_range(NaN, 1, 10)).toBe(1)
    })

    test('parse_int', () => {
        expect(parse_int(5)).toBe(5)
        expect(parse_int('$1,234')).toBe(1234)
        expect(parse_int('-3.7')).toBe(-3)
        expect(parse_int('abc')).toBe(null)
        expect(parse_int(null)).toBe(null)
        expect(parse_int(NaN)).toBe(null)
    })

    test('parse_float', () => {
        expect(parse_float('$1,234.5')).toBe(1234.5)
        expect(parse_float('x')).toBe(null)
        expect(parse_float(2.5)).toBe(2.5)
        expect(parse_float({})).toBe(null)
    })
})


describe('objects', () => {

    test('nested_objects_set sets deep values without mutating keys', () => {
        const obj = {a: {b: {c: 1}}}
        const keys:MinOne<string> = ['a', 'b', 'c']
        nested_objects_set(obj, keys, 2)
        expect(obj.a.b.c).toBe(2)
        expect(keys).toEqual(['a', 'b', 'c'])
    })

    test('nested_objects_set throws when path missing', () => {
        expect(() => nested_objects_set({a: null}, ['a', 'b'], 1)).toThrow(NestedKeyMissing)
    })

    test('nested_objects_update merges deeply', () => {
        const base = {a: 1, b: {c: 2, d: 3}, e: [1]}
        nested_objects_update(base, {b: {c: 5}, e: [2, 3]})
        expect(base).toEqual({a: 1, b: {c: 5, d: 3}, e: [2, 3]})
    })

    test('nested_objects_update rejects new keys and structure changes', () => {
        expect(() => nested_objects_update({a: 1}, {z: 1})).toThrow(NestedKeyMissing)
        expect(() => nested_objects_update({a: {b: 1}}, {a: 5})).toThrow(NestedStructureChanged)
        expect(() => nested_objects_update({a: [1]}, {a: 'x'})).toThrow(NestedStructureChanged)
    })

    test('nested_objects_update allows null to object', () => {
        const base:Record<string, unknown> = {a: null}
        nested_objects_update(base, {a: {b: 1}})
        expect(base['a']).toEqual({b: 1})
    })
})


describe('strings', () => {

    test('partition splits at first occurrence', () => {
        expect(partition('a:b:c', ':')).toEqual(['a', 'b:c'])
        expect(partition('abc', ':')).toEqual(['abc', ''])
        expect(partition(':abc', ':')).toEqual(['', 'abc'])
        expect(partition('', ':')).toEqual(['', ''])
    })

    test('replace_without_overlap avoids double replacement', () => {
        expect(replace_without_overlap('SUBJECT and CONTACT', {
            SUBJECT: 'CONTACT ME',
            CONTACT: 'Bob',
        })).toBe('CONTACT ME and Bob')
    })

    test('replace_without_overlap inserts values literally', () => {
        // `$` sequences in values must be inserted literally
        expect(replace_without_overlap('Subject: SUBJECT', {SUBJECT: 'Save $$ now $&'}))
            .toBe('Subject: Save $$ now $&')
    })

    test('escape_for_html', () => {
        expect(escape_for_html('<b>&"</b>')).toBe('&lt;b&gt;&amp;"&lt;/b&gt;')
    })

    test('str_or_null', () => {
        expect(str_or_null('')).toBe(null)
        expect(str_or_null(null)).toBe(null)
        expect(str_or_null(5)).toBe('5')
        expect(str_or_null('a')).toBe('a')
    })

    test('sanitize_filename removes invalid chars and limits length', () => {
        expect(sanitize_filename('a/b\\c?d%e*f:g|h"i<j>k')).toBe('abcdefghijk')
        expect(sanitize_filename('x'.repeat(100))).toHaveLength(40)
    })
})

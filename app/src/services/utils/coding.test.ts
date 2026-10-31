// @vitest-environment happy-dom

import {describe, expect, test, vi} from 'vitest'

import {join_buffers, buffers_equal} from './buffers'
import {buffer_to_url64, url64_to_buffer, buffer_to_standard_url64, standard_url64_to_buffer,
    buffer_to_base64, base64_to_buffer, utf8_to_string, string_to_utf8, buffer_to_hex,
    buffer_to_blob, object_to_blob, blob_to_url, stream_to_buffer, trusted_html_to_text,
    jwt_to_object, canvas_to_blob, bitmap_to_blob, bitmap_to_bitcanvas, bitmap_to_2dcanvas,
    canvas_to_bitmap, clone_canvas, blob_to_bitmap, blob_to_bitcanvas} from './coding'


// Helper for making buffers from byte arrays
const bytes = (...values:number[]) => new Uint8Array(values).buffer


describe('buffers', () => {

    test('join_buffers concatenates in order', () => {
        const joined = join_buffers([bytes(1, 2), bytes(), bytes(3)])
        expect([...new Uint8Array(joined)]).toEqual([1, 2, 3])
    })

    test('buffers_equal compares length and content', () => {
        expect(buffers_equal(bytes(1, 2), bytes(1, 2))).toBe(true)
        expect(buffers_equal(bytes(1, 2), bytes(1, 3))).toBe(false)
        expect(buffers_equal(bytes(1, 2), bytes(1, 2, 3))).toBe(false)
        expect(buffers_equal(bytes(), bytes())).toBe(true)
    })
})


describe('base64 variants', () => {

    // Bytes that produce +, / and = in standard base64
    const tricky = bytes(0xfb, 0xff, 0xbf, 0x00)

    test('standard base64 roundtrip', () => {
        const encoded = buffer_to_base64(tricky)
        expect(encoded).toBe('+/+/AA==')
        expect(buffers_equal(base64_to_buffer(encoded), tricky)).toBe(true)
    })

    test('standard url64 replaces + and / only', () => {
        const encoded = buffer_to_standard_url64(tricky)
        expect(encoded).toBe('-_-_AA==')
        expect(buffers_equal(standard_url64_to_buffer(encoded), tricky)).toBe(true)
    })

    test('custom url64 also replaces = with ~', () => {
        const encoded = buffer_to_url64(tricky)
        expect(encoded).toBe('-_-_AA~~')
        expect(buffers_equal(url64_to_buffer(encoded), tricky)).toBe(true)
    })

    test('empty buffer', () => {
        expect(buffer_to_url64(bytes())).toBe('')
        expect(url64_to_buffer('').byteLength).toBe(0)
    })
})


describe('text', () => {

    test('utf8 roundtrip with multibyte chars', () => {
        const text = 'héllo ✓ 你好'
        expect(utf8_to_string(string_to_utf8(text))).toBe(text)
    })

    test('string_to_utf8 buffer has exact length', () => {
        expect(string_to_utf8('✓').byteLength).toBe(3)
    })

    test('buffer_to_hex pads bytes', () => {
        expect(buffer_to_hex(bytes(0, 15, 255))).toBe('000fff')
    })

    test('trusted_html_to_text strips tags', () => {
        expect(trusted_html_to_text('<p>Hello <b>world</b></p>')).toBe('Hello world')
    })

    test('jwt_to_object extracts payload', () => {
        const payload = {sub: '123', name: 'Ünïcode'}
        const encoded = buffer_to_standard_url64(string_to_utf8(JSON.stringify(payload)))
            .replaceAll('=', '')  // JWTs omit padding
        expect(jwt_to_object(`header.${encoded}.signature`)).toEqual(payload)
    })
})


describe('blobs', () => {

    test('buffer_to_blob sets optional type', () => {
        expect(buffer_to_blob(bytes(1), 'image/png').type).toBe('image/png')
        expect(buffer_to_blob(bytes(1)).type).toBe('')
    })

    test('object_to_blob produces json', async () => {
        const blob = object_to_blob({a: 1})
        expect(blob.type).toBe('application/json')
        expect(JSON.parse(await blob.text())).toEqual({a: 1})
    })

    test('blob_to_url produces data url', async () => {
        const url = await blob_to_url(new Blob(['hi'], {type: 'text/plain'}))
        expect(url).toBe('data:text/plain;base64,aGk=')
    })

    test('stream_to_buffer reads whole stream', async () => {
        const stream = new Blob(['abc']).stream() as unknown as ReadableStream
        expect(utf8_to_string(await stream_to_buffer(stream))).toBe('abc')
    })
})


describe('canvas helpers', () => {

    // Minimal fake canvas that records calls
    class FakeCanvas {
        width:number
        height:number
        calls:string[] = []
        constructor(width:number, height:number){
            this.width = width
            this.height = height
        }
        getContext(type:string){
            return {
                transferFromImageBitmap: () => this.calls.push(`${type}:transfer`),
                drawImage: () => this.calls.push(`${type}:draw`),
            }
        }
        convertToBlob(options:{type:string, quality:number}){
            return Promise.resolve(new Blob([String(options.quality)], {type: options.type}))
        }
        transferToImageBitmap(){
            return {width: this.width, height: this.height}
        }
    }

    test('conversions delegate to canvas apis', async () => {
        vi.stubGlobal('OffscreenCanvas', FakeCanvas)
        vi.stubGlobal('createImageBitmap', async () => ({width: 4, height: 2}))
        const bitmap = {width: 4, height: 2} as ImageBitmap

        const bitcanvas = bitmap_to_bitcanvas(bitmap) as unknown as FakeCanvas
        expect([bitcanvas.width, bitcanvas.height]).toEqual([4, 2])
        expect(bitcanvas.calls).toEqual(['bitmaprenderer:transfer'])

        const canvas2d = bitmap_to_2dcanvas(bitmap) as unknown as FakeCanvas
        expect(canvas2d.calls).toEqual(['2d:draw'])

        const cloned = clone_canvas(canvas2d as unknown as OffscreenCanvas) as unknown as FakeCanvas
        expect(cloned.calls).toEqual(['2d:draw'])

        expect(canvas_to_bitmap(canvas2d as unknown as OffscreenCanvas))
            .toEqual({width: 4, height: 2})

        const blob = await canvas_to_blob(canvas2d as unknown as OffscreenCanvas, 'jpeg', 0.5)
        expect(blob.type).toBe('image/jpeg')
        expect(await blob.text()).toBe('0.5')

        expect((await bitmap_to_blob(bitmap)).type).toBe('image/png')
        expect(await blob_to_bitmap(new Blob())).toEqual({width: 4, height: 2})
        expect((await blob_to_bitcanvas(new Blob())).width).toBe(4)

        vi.unstubAllGlobals()
    })
})

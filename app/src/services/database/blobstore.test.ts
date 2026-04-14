// AI GENERATED - NOT YET REVIEWED

import {expect, test} from '@playwright/test'

import {NativeBrowser} from '../native/native_browser'
import {blobstore_new, blobstore_read, blobstore_read_image, blobstore_read_file,
    blobstore_remove, blobstore_change, blobstore_copy_impatient} from './blobstore'
import {MustRestore} from '../utils/exceptions'


// GLOBAL MOCKS

global.self = global as Window & typeof globalThis
self.app_native = new NativeBrowser()
self.app_native.app_file_read = async () => new Uint8Array([1, 2, 3]).buffer


// UTILS

function make_mock_native(){
    // Create a fresh mock native with file tracking for each test
    const mock = new NativeBrowser()
    const files = new Map<string, ArrayBuffer>()
    const removed:string[] = []

    mock.user_file_write = async (path:string, data:ArrayBuffer) => {
        files.set(path, data)
    }
    mock.user_file_read = async (path:string) => {
        if (!files.has(path)){
            return null
        }
        return files.get(path)!
    }
    mock.user_file_remove = async (path:string) => {
        removed.push(path)
        files.delete(path)
    }
    // Provide a real placeholder so blobstore_read_image can return something
    mock.app_file_read = async () => new Uint8Array([0xff, 0xd8]).buffer

    return {mock, files, removed}
}


// BLOBSTORE_NEW TESTS

test.describe('blobstore_new', () => {

    test('null input returns null without writing', async () => {
        const {mock, files} = make_mock_native()
        self.app_native = mock

        const result = await blobstore_new(null)

        expect(result).toBeNull()
        expect(files.size).toBe(0)
    })

    test('blob is written to Internal Files and filename is returned', async () => {
        const {mock, files} = make_mock_native()
        self.app_native = mock

        const blob = new Blob([new Uint8Array([1, 2, 3])], {type: 'image/jpeg'})
        const filename = await blobstore_new(blob)

        // Should return a non-null filename string
        expect(filename).toBeTruthy()
        expect(typeof filename).toBe('string')

        // File should be written to Internal Files subdirectory
        expect(files.has(`Internal Files/${filename}`)).toBe(true)
    })

    test('filename includes today date and correct extension', async () => {
        const {mock} = make_mock_native()
        self.app_native = mock

        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '_')
        const blob = new Blob([new Uint8Array([1])], {type: 'image/webp'})
        const filename = await blobstore_new(blob)

        // Filename pattern: YYYY_MM_DD_<6chars>.<ext>
        expect(filename).toMatch(new RegExp(`^${today}_[A-Za-z0-9_-]{8}\\.webp$`))
    })

    test('filename extension matches blob mime type', async () => {
        const {mock} = make_mock_native()
        self.app_native = mock

        const blob = new Blob([new Uint8Array([1])], {type: 'application/pdf'})
        const filename = await blobstore_new(blob)

        expect(filename).toMatch(/\.pdf$/)
    })

})


// BLOBSTORE_READ TESTS

test.describe('blobstore_read', () => {

    test('null input returns null', async () => {
        const result = await blobstore_read(null)
        expect(result).toBeNull()
    })

    test('blob input is returned directly (old in-DB blob pass-through)', async () => {
        const blob = new Blob([new Uint8Array([1, 2, 3])], {type: 'image/png'})
        const result = await blobstore_read(blob)
        expect(result).toBe(blob)
    })

    test('filename string reads from Internal Files path', async () => {
        const {mock, files} = make_mock_native()
        self.app_native = mock

        // Pre-populate the mock filesystem
        const data = new Uint8Array([10, 20, 30]).buffer
        files.set('Internal Files/2026_01_01_abcdef12.jpg', data)

        const result = await blobstore_read('2026_01_01_abcdef12.jpg')

        expect(result).not.toBeNull()
        expect(result.type).toBe('image/jpeg')
        const result_buf = await result.arrayBuffer()
        expect(new Uint8Array(result_buf)).toEqual(new Uint8Array(data))
    })

    test('missing file throws MustRestore', async () => {
        const {mock} = make_mock_native()
        self.app_native = mock

        await expect(blobstore_read('nonexistent.jpg')).rejects.toBeInstanceOf(MustRestore)
    })

})


// BLOBSTORE_READ_IMAGE TESTS

test.describe('blobstore_read_image', () => {

    test('missing file returns placeholder blob instead of throwing', async () => {
        const {mock} = make_mock_native()
        self.app_native = mock

        // Should not throw — returns placeholder
        const result = await blobstore_read_image('missing.jpg')

        expect(result).not.toBeNull()
        expect(result.size).toBeGreaterThan(0)
    })

    test('null input returns null', async () => {
        const result = await blobstore_read_image(null)
        expect(result).toBeNull()
    })

})


// BLOBSTORE_READ_FILE TESTS

test.describe('blobstore_read_file', () => {

    test('missing file returns empty blob instead of throwing', async () => {
        const {mock} = make_mock_native()
        self.app_native = mock

        const result = await blobstore_read_file('missing.pdf')

        expect(result).not.toBeNull()
        expect(result.size).toBe(0)
    })

    test('null input returns null', async () => {
        const result = await blobstore_read_file(null)
        expect(result).toBeNull()
    })

})


// BLOBSTORE_REMOVE TESTS

test.describe('blobstore_remove', () => {

    test('null ref does not call remove', async () => {
        const {mock, removed} = make_mock_native()
        self.app_native = mock

        await blobstore_remove(null)

        expect(removed).toHaveLength(0)
    })

    test('blob ref does not call remove (old in-DB blobs delete with their record)', async () => {
        const {mock, removed} = make_mock_native()
        self.app_native = mock

        await blobstore_remove(new Blob([new Uint8Array([1])]))

        expect(removed).toHaveLength(0)
    })

    test('filename string removes from Internal Files', async () => {
        const {mock, removed} = make_mock_native()
        self.app_native = mock

        await blobstore_remove('2026_01_15_abc123.jpg')

        expect(removed).toEqual(['Internal Files/2026_01_15_abc123.jpg'])
    })

})


// BLOBSTORE_CHANGE TESTS

test.describe('blobstore_change', () => {

    test('writes new blob and removes old filename', async () => {
        const {mock, files, removed} = make_mock_native()
        self.app_native = mock

        // Pre-populate the old file
        files.set('Internal Files/old_file.jpg', new Uint8Array([9, 8, 7]).buffer)

        const new_blob = new Blob([new Uint8Array([1, 2, 3])], {type: 'image/jpeg'})
        const new_filename = await blobstore_change('old_file.jpg', new_blob)

        // New file should be written
        expect(new_filename).toBeTruthy()
        expect(files.has(`Internal Files/${new_filename}`)).toBe(true)

        // Old file should be removed
        expect(removed).toContain('Internal Files/old_file.jpg')
    })

    test('null old ref does not call remove', async () => {
        const {mock, removed} = make_mock_native()
        self.app_native = mock

        const new_blob = new Blob([new Uint8Array([1])], {type: 'image/png'})
        await blobstore_change(null, new_blob)

        expect(removed).toHaveLength(0)
    })

    test('null new blob returns null and removes old', async () => {
        const {mock, files, removed} = make_mock_native()
        self.app_native = mock

        files.set('Internal Files/to_delete.jpg', new Uint8Array([1]).buffer)
        const result = await blobstore_change('to_delete.jpg', null)

        expect(result).toBeNull()
        expect(removed).toContain('Internal Files/to_delete.jpg')
    })

})


// BLOBSTORE_COPY_IMPATIENT TESTS

test.describe('blobstore_copy_impatient', () => {

    test('null input returns null', () => {
        const result = blobstore_copy_impatient(null)
        expect(result).toBeNull()
    })

    test('string ref returns new filename synchronously', async () => {
        const {mock, files} = make_mock_native()
        self.app_native = mock

        // Pre-populate file so background read succeeds
        files.set('Internal Files/source.jpg', new Uint8Array([1, 2, 3]).buffer)

        const new_filename = blobstore_copy_impatient('source.jpg')

        // Returns immediately without awaiting
        expect(new_filename).toBeTruthy()
        expect(typeof new_filename).toBe('string')
        expect(new_filename).not.toBe('source.jpg')
    })

    test('existing blob ref returns new filename synchronously', () => {
        const {mock} = make_mock_native()
        self.app_native = mock

        const blob = new Blob([new Uint8Array([1])], {type: 'image/png'})
        const new_filename = blobstore_copy_impatient(blob)

        expect(new_filename).toBeTruthy()
        expect(typeof new_filename).toBe('string')
    })

})

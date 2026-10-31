
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {setup_globals, MemoryNative} from '@/../tests/unit_utils'
import {Database} from './database'
import {migrate} from './blobstore_migrate'


let db:Database
let native:MemoryNative

beforeEach(async () => {
    ({db, native} = await setup_globals())
    // Image conversion relies on browser canvas APIs
    vi.stubGlobal('createImageBitmap', async () => ({width: 1, height: 1}))
    vi.stubGlobal('OffscreenCanvas', class {
        getContext(){return {transferFromImageBitmap(){}}}
        async convertToBlob(){return new Blob(['webp'], {type: 'image/webp'})}
    })
})

afterEach(() => {
    vi.unstubAllGlobals()
})


describe('blobstore migrate', () => {

    test('moves inline blobs from all record types to files', async () => {
        const blob = new Blob(['data'], {type: 'image/png'})

        // Sections of each blob-holding type
        const images = await db.sections.create('images')
        const files = await db.sections.create('files')
        const page = await db.sections.create('page')
        const text = await db.sections.create('text')
        if (images.content.type !== 'images' || files.content.type !== 'files'
                || page.content.type !== 'page'){
            throw new Error('impossible')
        }
        images.content.images = [{id: 'i', data: blob, caption: ''}]
        files.content.files = [{data: new Blob(['f'], {type: 'application/pdf'}), name: 'f',
            ext: '.pdf'}]
        page.content.image = blob
        await db.sections.set(images)
        await db.sections.set(files)
        await db.sections.set(page)

        // Profile, draft and message invite images
        const profile = await db.profiles.create()
        profile.msg_options_identity.invite_image = blob
        profile.options.reply_invite_image = blob
        await db.profiles.set(profile)
        const draft = await db.drafts.create()
        draft.options_identity.invite_image = blob
        await db.drafts.set(draft)
        const draft2 = await db.drafts.create()
        draft2.profile = profile.id
        draft2.options_identity.invite_image = blob
        await db.drafts.set(draft2)
        const msg = await db.draft_to_message(draft2.id)

        const progress = vi.fn()
        const skipped = await migrate(progress)
        expect(skipped).toBe(0)
        expect(progress).toHaveBeenLastCalledWith(7, 7)

        const new_images = (await db.sections.get(images.id))!.content
        expect(new_images.type === 'images' && typeof new_images.images[0]!.data).toBe('string')
        const new_files = (await db.sections.get(files.id))!.content
        expect(new_files.type === 'files' && typeof new_files.files[0]!.data).toBe('string')
        const new_page = (await db.sections.get(page.id))!.content
        expect(new_page.type === 'page' && typeof new_page.image).toBe('string')
        expect((await db.sections.get(text.id))!.content.type).toBe('text')
        const new_profile = (await db.profiles.get(profile.id))!
        expect(typeof new_profile.msg_options_identity.invite_image).toBe('string')
        expect(typeof new_profile.options.reply_invite_image).toBe('string')
        expect(typeof (await db.drafts.get(draft.id))!.options_identity.invite_image)
            .toBe('string')
        expect(typeof (await db.messages.get(msg.id))!.draft.options_identity.invite_image)
            .toBe('string')
        expect(native.files.size).toBe(7)
    })

    test('skips and reports records that fail', async () => {
        const profile = await db.profiles.create()
        profile.msg_options_identity.invite_image = new Blob(['x'])
        await db.profiles.set(profile)
        native.user_file_write = async () => {throw new Error('disk full')}
        expect(await migrate(() => undefined)).toBe(1)
        expect(self.app_report_error).toHaveBeenCalledTimes(1)
    })

    test('falls back to original blob if webp conversion fails', async () => {
        vi.stubGlobal('createImageBitmap', async () => {throw new Error('bad image')})
        const section = await db.sections.create('images')
        if (section.content.type !== 'images'){
            throw new Error('impossible')
        }
        section.content.images = [{id: 'i', data: new Blob(['raw'], {type: 'image/gif'}),
            caption: ''}]
        await db.sections.set(section)
        expect(await migrate(() => undefined)).toBe(0)
        const filename = [...native.files.keys()][0]!
        expect(filename).toMatch(/\.gif$/)
    })
})

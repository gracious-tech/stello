
import {blobstore_new} from './blobstore'
import {blob_to_bitmap, bitmap_to_blob} from '../utils/coding'
import {AppDatabaseConnection, RecordSection, RecordProfile, RecordDraft, RecordMessage}
    from './types'


export async function migrate(on_progress:(progress:number, total:number)=>void):Promise<void>{
    // Migrate all inline Blobs to external blobstore files

    const db = self.app_db._conn

    // Count records in each table
    const section_count = await db.count('sections')
    const profile_count = await db.count('profiles')
    const draft_count = await db.count('drafts')
    const message_count = await db.count('messages')
    const total = section_count + profile_count + draft_count + message_count
    let progress = 0

    // Process one record at a time in case one fails (and avoid loading too much into memory)
    for (const key of await db.getAllKeys('sections')){
        const section = await db.get('sections', key)
        if (section){
            await migrate_section(section, db)
        }
        on_progress(++progress, total)
    }

    for (const key of await db.getAllKeys('profiles')){
        const profile = await db.get('profiles', key)
        if (profile){
            await migrate_profile(profile, db)
        }
        on_progress(++progress, total)
    }

    for (const key of await db.getAllKeys('drafts')){
        const draft = await db.get('drafts', key)
        if (draft){
            await migrate_draft(draft, db)
        }
        on_progress(++progress, total)
    }

    for (const key of await db.getAllKeys('messages')){
        const message = await db.get('messages', key)
        if (message){
            await migrate_message(message, db)
        }
        on_progress(++progress, total)
    }
}


// Record types


async function migrate_section(section:RecordSection, db:AppDatabaseConnection):Promise<void>{
    // Migrate blob fields in a section record
    const content = section.content
    let changed = false

    if (content.type === 'images'){
        for (const image of content.images){
            if (image.data instanceof Blob){
                image.data = await blobstore_new(await convert_to_webp(image.data))
                changed = true
            }
        }
    } else if (content.type === 'files'){
        for (const file of content.files){
            if (file.data instanceof Blob){
                file.data = await blobstore_new(file.data)
                changed = true
            }
        }
    } else if (content.type === 'page'){
        if (content.image instanceof Blob){
            content.image = await blobstore_new(await convert_to_webp(content.image))
            changed = true
        }
    }

    if (changed){
        await db.put('sections', section)
    }
}


async function migrate_profile(profile:RecordProfile, db:AppDatabaseConnection):Promise<void>{
    // Migrate invite image fields in a profile record
    let changed = false

    if (profile.msg_options_identity.invite_image instanceof Blob){
        profile.msg_options_identity.invite_image =
            await blobstore_new(profile.msg_options_identity.invite_image)
        changed = true
    }
    if (profile.options.reply_invite_image instanceof Blob){
        profile.options.reply_invite_image =
            await blobstore_new(profile.options.reply_invite_image)
        changed = true
    }

    if (changed){
        await db.put('profiles', profile)
    }
}


async function migrate_draft(draft:RecordDraft, db:AppDatabaseConnection):Promise<void>{
    // Migrate invite image field in a draft record
    if (draft.options_identity.invite_image instanceof Blob){
        draft.options_identity.invite_image =
            await blobstore_new(draft.options_identity.invite_image)
        await db.put('drafts', draft)
    }
}


async function migrate_message(message:RecordMessage, db:AppDatabaseConnection):Promise<void>{
    // Migrate invite image field in a message record
    if (message.draft.options_identity.invite_image instanceof Blob){
        message.draft.options_identity.invite_image =
            await blobstore_new(message.draft.options_identity.invite_image)
        await db.put('messages', message)
    }
}


// Utils


async function convert_to_webp(blob:Blob):Promise<Blob>{
    // Convert an image blob to webp q0.9, falling back to storing as-is if encoding fails
    try {
        const bitmap = await blob_to_bitmap(blob)
        return bitmap_to_blob(bitmap, 'webp', 0.9)
    } catch {
        return blob
    }
}

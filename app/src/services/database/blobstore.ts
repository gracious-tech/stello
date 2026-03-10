
import mime from 'mime-types'

import {generate_token} from '@/services/utils/crypt'


function _new_filename(ref:string|Blob){
    // Generate new filename with date and ext so still easy to find manually in filesystem
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '_')
    const short_id = generate_token(6)
    const ext = typeof ref === 'string' ? ref.slice(ref.lastIndexOf('.') + 1)
        : (mime.extension(ref.type) || 'bin')
    return `${date}_${short_id}.${ext}`
}


export async function blobstore_new(blob:Blob):Promise<string>
export async function blobstore_new(blob:Blob|null):Promise<string|null>
export async function blobstore_new(blob:Blob|null):Promise<string|null>{
    // Write blob to a new external file and return the filename
    if (!blob)
        return null
    const filename = _new_filename(blob)
    await self.app_native.user_file_write(`Internal Files/${filename}`, await blob.arrayBuffer())
    return filename
}


export async function blobstore_read(ref:string|Blob):Promise<Blob>
export async function blobstore_read(ref:string|Blob|null):Promise<Blob|null>
export async function blobstore_read(ref:string|Blob|null):Promise<Blob|null>{
    // Load blob from filename ref (or simply return if passed directly for old in-DB storage)
    if (typeof ref !== 'string')
        return ref  // Either null or a blob already
    const ext = ref.slice(ref.lastIndexOf('.') + 1)
    const buffer = await self.app_native.user_file_read(`Internal Files/${ref}`)
    const mimetype = mime.lookup(ext) || 'application/octet-stream'
    return new Blob([buffer], {type: mimetype})
}


export function blobstore_copy_impatient(ref:string|Blob):string
export function blobstore_copy_impatient(ref:string|Blob|null):string|null
export function blobstore_copy_impatient(ref:string|Blob|null):string|null{
    // Copy blob to a new file, returning the new filename immediately without waiting for the copy
    // NOTE Useful inside IDB transactions where async file I/O would cause auto-commit
    if (ref === null)
        return null
    const filename = _new_filename(ref)
    // NOTE Can't just do a native-level file copy as ref may be a Blob in indexedDB
    void blobstore_read(ref).then(blob => blob.arrayBuffer()).then(buf =>
        self.app_native.user_file_write(`Internal Files/${filename}`, buf))
    return filename
}


export async function blobstore_change(old_ref:string|Blob|null, new_blob:Blob):Promise<string>
export async function blobstore_change(old_ref:string|Blob|null, new_blob:Blob|null)
        :Promise<string|null>
export async function blobstore_change(old_ref:string|Blob|null, new_blob:Blob|null)
        :Promise<string|null>{
    // Write new blob file then remove old (write-first ordering avoids data loss on failure)
    const filename = await blobstore_new(new_blob)
    await blobstore_remove(old_ref)
    return filename
}


export async function blobstore_remove(ref:string|Blob|null):Promise<void>{
    // Delete blob file if a filename string is passed (old in-DB blobs will delete with record)
    if (typeof ref === 'string')
        await self.app_native.user_file_remove(`Internal Files/${ref}`)
}


export async function default_invite_image(){
    // Get the default invite image as a blob
    const data = await self.app_native.app_file_read('default_invite_image.jpg')
    return new Blob([data], {type: 'image/jpeg'})
}

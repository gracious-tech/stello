

// BINARY


export function buffer_to_url64(buffer:ArrayBuffer):string{
    // Custom version of url-safe base64 that also replaces `=` with `~`
    return buffer_to_standard_url64(buffer).replaceAll('=', '~')
}


export function buffer_to_standard_url64(buffer:ArrayBuffer):string{
    // Encode binary data as a url-safe base64 string
    // NOTE btoa only works with strings so convert each byte to a char
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
    // Convert to urlsafe base64
    return base64.replaceAll('+', '-').replaceAll('/', '_')
}


export function url64_to_buffer(encoded:string):ArrayBuffer{
    // Custom version of url-safe base64 that also expects `=` to have been replaced with `~`
    return standard_url64_to_buffer(encoded.replaceAll('~', '='))
}


export function standard_url64_to_buffer(encoded:string):ArrayBuffer{
    // Convert a URL-safe base64 encoded string to an ArrayBuffer
    /* Explanation of decoding
        atob() is weird in that its "binary" output is still a string
        While JS uses UTF-16, atob() will only ever generate chars that take up 1 of the 2 bytes
        Which means that charCodeAt() will return integers up to 1 byte only (even if supports 2)
        Which can then be fed into a Uint8Array!
    */
    const regular_base64 = encoded.replaceAll('-', '+').replaceAll('_', '/')
    const binary_string = atob(regular_base64)
    return Uint8Array.from(binary_string, c => c.charCodeAt(0)).buffer
}


export function utf8_to_string(buffer:ArrayBuffer):string{
    // Convert a UTF8 ArrayBuffer to a string
    return new TextDecoder('utf-8').decode(buffer)
}


export function string_to_utf8(text:string):ArrayBuffer{
    // Convert a string to a UTF8 ArrayBuffer
    return new TextEncoder().encode(text).buffer
}


export function buffer_to_hex(array_buffer:ArrayBuffer):string{
    // Convert an array buffer into a hex string (useful for hash digests)
    const array = Array.from(new Uint8Array(array_buffer))
    return array.map(b => ('00' + b.toString(16)).slice(-2)).join('')
}


export function buffer_to_blob(buffer:ArrayBuffer, type?:string):Blob{
    // Converts an array buffer to a blob with given mime type
    return new Blob([buffer], type ? {type} : undefined)
}


export function object_to_blob(object:object):Blob{
    // Converts an object to a JSON blob
    return new Blob([JSON.stringify(object)], {type: 'application/json'})
}


export async function stream_to_buffer(stream:ReadableStream):Promise<ArrayBuffer>{
    // Read a stream into memory and return ArrayBuffer
    // NOTE Creating a fake Response as it has convenient methods for reading streams
    return new Response(stream).arrayBuffer()
}


// IMAGES


export function bitmap_to_canvas(bitmap:ImageBitmap):OffscreenCanvas{
    // Convert an image bitmap into a canvas (can then use canvas to generate blobs)
    // WARN You cannot use the original bitmap after `transferFromImageBitmap()` is used
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    canvas.getContext('bitmaprenderer')?.transferFromImageBitmap(bitmap)
    return canvas
}


export function canvas_to_blob(canvas:OffscreenCanvas, type:'png'|'jpeg'|'webp'='png', quality=0.8)
        :Promise<Blob>{
    // Generate a compressed image blob from the given canvas
    // NOTE quality not relevant for png
    return canvas.convertToBlob({type: `image/${type}`, quality})
}


// TEXT


export function trusted_html_to_text(trusted_html:string){
    // Strip input of html tags
    // SECURITY Do NOT use for untrusted html as during parsing can execute js and load assets etc
    const div = self.document.createElement('div')
    div.innerHTML = trusted_html
    return div.innerText
}


export function jwt_to_object(jwt:string){
    // Convert a JSON Web Token string to an object (only extracts payload part)
    // SECURITY Does not verify signature, so ensure to do that separately if necessary
    const payload_part = jwt.split('.')[1]!
    return JSON.parse(utf8_to_string(standard_url64_to_buffer(payload_part))) as unknown
}

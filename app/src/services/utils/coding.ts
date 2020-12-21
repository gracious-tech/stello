

// BINARY


export function buffer_to_url64(buffer:ArrayBuffer):string{
    // Encode binary data as a url-safe base64 string (same as Python version but '=' -> '~')
    // NOTE btoa only works with strings so convert each byte to a char
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
    // Convert to urlsafe base64
    return base64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '~')
}


export function url64_to_buffer(encoded:string):ArrayBuffer{
    // Convert a URL-safe base64 encoded string to an ArrayBuffer
    /* Explanation of decoding
        atob() is weird in that its "binary" output is still a string
        While JS uses UTF-16, atob() will only ever generate chars that take up 1 of the 2 bytes
        Which means that charCodeAt() will return integers up to 1 byte only (even if supports 2)
        Which can then be fed into a Uint8Array!
    */
    const regular_base64 = encoded.replaceAll('-', '+').replaceAll('_', '/').replaceAll('~', '=')
    const binary_string = atob(regular_base64)
    return Uint8Array.from(binary_string, c => c.charCodeAt(0)).buffer
}


export function buffer_to_utf8(buffer:ArrayBuffer):string{
    // Convert an ArrayBuffer to a utf-8 string (i.e. 1 byte = 1 char)
    return new TextDecoder('utf-8').decode(buffer)
}


export function utf8_to_buffer(text:string):ArrayBuffer{
    // Convert a utf-8 string (i.e. 1 byte = 1 char) to an ArrayBuffer
    return new TextEncoder().encode(text).buffer
}


export function buffer_to_hex(array_buffer:ArrayBuffer):string{
    // Convert an array buffer into a hex string (useful for hash digests)
    const array = Array.from(new Uint8Array(array_buffer))
    return array.map(b => ('00' + b.toString(16)).slice(-2)).join('')
}


export function buffer_to_blob(buffer:ArrayBuffer, type?:string):Blob{
    // Converts an array buffer to a blob with given mime type
    return new Blob([buffer], {type})
}


export function object_to_blob(object:object):Blob{
    // Converts an object to a JSON blob
    return new Blob([JSON.stringify(object)], {type: 'application/json'})
}


// IMAGES


export function bitmap_to_canvas(bitmap:ImageBitmap):OffscreenCanvas{
    // Convert an image bitmap into a canvas (can then use canvas to generate blobs)
    // WARN You cannot use the original bitmap after `transferFromImageBitmap()` is used
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    canvas.getContext('bitmaprenderer').transferFromImageBitmap(bitmap)
    return canvas
}


export function canvas_to_blob(canvas:OffscreenCanvas, type='webp', quality=0.8):Promise<Blob>{
    // Generate a compressed image blob from the given canvas
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

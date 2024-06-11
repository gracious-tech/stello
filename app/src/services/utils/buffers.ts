
export function join_buffers(buffers:ArrayBufferLike[]):ArrayBuffer{
    // Join an array of buffers together
    const total_num_bytes = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0)
    const joined_bytes = new Uint8Array(total_num_bytes)

    let offset = 0
    for (const buffer of buffers){
        joined_bytes.set(new Uint8Array(buffer), offset)
        offset += buffer.byteLength
    }

    return joined_bytes.buffer
}


export function buffers_equal(a:ArrayBufferLike, b:ArrayBufferLike):boolean{
    // Confirm is two array buffers are the same
    const aview = new DataView(a)
    const bview = new DataView(b)

    // First confirm same length, otherwise could throw errors or succeed on partial data
    if (a.byteLength !== b.byteLength){
        return false
    }

    // Compare every byte
    for (let i = 0; i < a.byteLength; i++){
        if (aview.getUint8(i) !== bview.getUint8(i)){
            return false
        }
    }
    return true
}

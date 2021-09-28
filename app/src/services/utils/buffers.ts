
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

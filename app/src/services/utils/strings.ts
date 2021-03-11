
export function partition(original:string, separator:string):[string, string]{
    // Split string at separator at first occurance only and return both sides (excluding separator)
    const a = original.split(separator, 1)[0] || ''
    const b = original.slice((a + separator).length)
    return [a, b]
}

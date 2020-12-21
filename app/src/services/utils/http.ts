

export async function request(input:string|Request, init?:RequestInit, forbidden404:boolean=false)
        :Promise<Response>{
    // Wrapper around `fetch` which returns null for 404s and throws for other non-200s
    // NOTE AWS S3 returns 403 for 404s when user doesn't have ListBucket permission
    const resp = await fetch(input, init)
    if (resp.status === 404 || (forbidden404 && resp.status === 403)){
        return null
    }
    if (resp.ok){
        return resp
    }
    throw new Error("Bad response: " + resp.status)
}


export function request_json(input:string|Request, init?:RequestInit, forbidden404:boolean=false)
        :Promise<any>{
    // Same as `request` but auto-parse json response
    return request(input, init, forbidden404).then(resp => resp && resp.json())
}


export function request_blob(input:string|Request, init?:RequestInit, forbidden404:boolean=false)
        :Promise<Blob>{
    // Same as `request` but get response's blob if any
    return request(input, init, forbidden404).then(resp => resp && resp.blob())
}


export function request_buffer(input:string|Request, init?:RequestInit, forbidden404:boolean=false)
        :Promise<ArrayBuffer>{
    // Same as `request` but get response's body as an ArrayBuffer
    return request(input, init, forbidden404).then(resp => resp && resp.arrayBuffer())
}

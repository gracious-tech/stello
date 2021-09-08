

export class RequestError extends Error {
    // Thrown when a request does not go as expected
}


// Overloads for request
export async function request(input:string|Request, init?:RequestInit):Promise<Response>

export async function request(input:string|Request, init:RequestInit, read_body:'text',
    bad_status_handling?:'throw'):Promise<string>
export async function request(input:string|Request, init:RequestInit, read_body:'text',
    bad_status_handling:'throw_null404'|'throw_null403-4'):Promise<string|null>

export async function request<T>(input:string|Request, init:RequestInit, read_body:'json',
    bad_status_handling?:'throw'):Promise<T>
export async function request<T>(input:string|Request, init:RequestInit, read_body:'json',
    bad_status_handling:'throw_null404'|'throw_null403-4'):Promise<T|null>

export async function request(input:string|Request, init:RequestInit, read_body:'blob',
    bad_status_handling?:'throw'):Promise<Blob>
export async function request(input:string|Request, init:RequestInit, read_body:'blob',
    bad_status_handling:'throw_null404'|'throw_null403-4'):Promise<Blob|null>

export async function request(input:string|Request, init:RequestInit, read_body:'arrayBuffer',
    bad_status_handling?:'throw'):Promise<ArrayBuffer>
export async function request(input:string|Request, init:RequestInit, read_body:'arrayBuffer',
    bad_status_handling:'throw_null404'|'throw_null403-4'):Promise<ArrayBuffer|null>

export async function request(input:string|Request, init?:RequestInit,
        read_body?:'text'|'json'|'blob'|'arrayBuffer',
        bad_status_handling?:'throw'|'throw_null404'|'throw_null403-4'):Promise<unknown>{
    /* Wrapper around `fetch` with the following improvements:
        * Throws specific error (fetch just throws generic TypeError)
        * Thrown errors have stack trace (fetch does not, making debugging very difficult)
        * Thrown errors include the URL requested (fetch does not)
        * Optionally throws for bad statuses
            * throw: throws for any bad status
            * throw_null404: throws for bad statuses but returns null for 404
            * throw_null403-4: same as throw_null404 but also treats 403 as a 404
                NOTE AWS S3 returns 403 for 404s when user doesn't have ListBucket permission
    */

    // Determine url, as will need when throwing errors
    const url = typeof input === 'string' ? input : input.url

    // Throw unique error for connection issues, with stack trace
    let resp:Response
    try {
        resp = await fetch(input, init)
    } catch {
        throw new RequestError(`network ${url}`)
    }

    // Optionally throw for bad statuses as well
    if (bad_status_handling && !resp.ok){
        if (resp.status === 403 && bad_status_handling === 'throw_null403-4'){
            return null
        }
        if (resp.status === 404 && (bad_status_handling === 'throw_null404'
                || bad_status_handling === 'throw_null403-4')){
            return null
        }
        throw new RequestError(`status ${resp.status} ${url}`)
    }

    // Try and read response if configured to
    if (!read_body){
        return resp
    }
    try {
        return await resp[read_body]() as unknown
    } catch {
        throw new RequestError(`body ${url}`)
    }
}


// SHORTCUTS


export function request_json<T>(input:string|Request, init?:RequestInit){
    // Request this type of response and throw if don't get it
    return request<T>(input, init ?? {}, 'json', 'throw')
}


export function request_text(input:string|Request, init?:RequestInit){
    // Request this type of response and throw if don't get it
    return request(input, init ?? {}, 'text', 'throw')
}


export function request_blob(input:string|Request, init?:RequestInit){
    // Request this type of response and throw if don't get it
    return request(input, init ?? {}, 'blob', 'throw')
}


export function request_buffer(input:string|Request, init?:RequestInit){
    // Request this type of response and throw if don't get it
    return request(input, init ?? {}, 'arrayBuffer', 'throw')
}


// Convenience


export function report_http_failure(error:unknown):void{  // Keep error:unknown to avoid type issues
    /* Report HTTP failure if it isn't just due to connection issue
        From a UI perspective, it should just be presented as a network issue, as user can't fix
        But from dev persective it needs either fixing or silencing if benign

    NOTE This is here for convenience, as not strictly a pure fn, & assumes global report fn exists
    NOTE error should have `unknown` type so don't have to import RequestError when calling it
    */
   if (!(error as RequestError).message.startsWith('network ')){
       self.app_report_error(error)
   }
}

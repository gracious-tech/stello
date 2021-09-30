
import {CustomError, MustReconnect} from './exceptions'


export interface JsonRequestInit extends RequestInit {
    // Extend RequestInit options by adding custom json property
    json?:unknown
    compress?:boolean
}


export class RequestErrorStatus extends CustomError {
    // Thrown when HTTP status code indicates an error occured
    url:string
    status:number

    constructor(url:string, status:number){
        // Include both url & status in message, but also provide separate access to them
        super(`${url} (${status})`)
        this.url = url
        this.status = status
    }
}

export class RequestErrorBody extends CustomError {
    // Thrown when problem reading response body
}


// Overloads for request
export async function request(input:string|Request, init?:JsonRequestInit):Promise<Response>

export async function request(input:string|Request, init:JsonRequestInit, read_body:undefined,
    bad_status_handling?:'throw'):Promise<Response>
export async function request(input:string|Request, init:JsonRequestInit, read_body:undefined,
    bad_status_handling:'throw_null404'|'throw_null403-4'):Promise<Response|null>

export async function request(input:string|Request, init:JsonRequestInit, read_body:'text',
    bad_status_handling?:'throw'):Promise<string>
export async function request(input:string|Request, init:JsonRequestInit, read_body:'text',
    bad_status_handling:'throw_null404'|'throw_null403-4'):Promise<string|null>

export async function request<T>(input:string|Request, init:JsonRequestInit, read_body:'json',
    bad_status_handling?:'throw'):Promise<T>
export async function request<T>(input:string|Request, init:JsonRequestInit, read_body:'json',
    bad_status_handling:'throw_null404'|'throw_null403-4'):Promise<T|null>

export async function request(input:string|Request, init:JsonRequestInit, read_body:'blob',
    bad_status_handling?:'throw'):Promise<Blob>
export async function request(input:string|Request, init:JsonRequestInit, read_body:'blob',
    bad_status_handling:'throw_null404'|'throw_null403-4'):Promise<Blob|null>

export async function request(input:string|Request, init:JsonRequestInit, read_body:'arrayBuffer',
    bad_status_handling?:'throw'):Promise<ArrayBuffer>
export async function request(input:string|Request, init:JsonRequestInit, read_body:'arrayBuffer',
    bad_status_handling:'throw_null404'|'throw_null403-4'):Promise<ArrayBuffer|null>

export async function request(input:string|Request, init?:JsonRequestInit,
        read_body?:'text'|'json'|'blob'|'arrayBuffer',
        bad_status_handling?:'throw'|'throw_null404'|'throw_null403-4'):Promise<unknown>{
    /* Wrapper around `fetch` with the following improvements:
        * Auto-detects content type
        * Adds `json` property to RequestInit for auto-stringifying of json body
        * Optionally compress request body if CompressionStream available (Chrome 80+)
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

    // Ensure headers exists, as will manipulate
    init = init ?? {}
    init.headers = new Headers(init.headers)

    // If json property exists, stringify as body
    if (init.json){
        init.body = JSON.stringify(init.json)
        init.headers.set('Content-Type', 'application/json')
    }

    // Body-specific
    if (init.body){

        // Auto-set content type if none yet
        // NOTE Fetch does this too, but if compressed the original blob type would get lost
        if (!init.headers.has('Content-Type')){
            init.headers.set('Content-Type',
                (init.body instanceof Blob ? init.body.type : '') || 'application/octet-stream')
        }

        // Optionally compress request body if possible (Chrome 80+)
        // NOTE Must be manually enabled as some servers don't support compressed requests
        if (init.compress && self.CompressionStream){

            // Use Response to convert any valid body to a stream so can pipe to compressor
            // NOTE Must convert back to Blob as ReadableStream not accepted for requests yet
            //      See https://github.com/whatwg/fetch/pull/425#issuecomment-614452337
            init.body = await new Response(
                new Response(init.body).body!.pipeThrough(new self.CompressionStream('gzip')),
            ).blob()
            init.headers.set('Content-Encoding', 'gzip')
        }
    }

    // Throw unique error for connection issues, with stack trace
    let resp:Response
    try {
        // Ensure custom args removed before calling
        delete init.json
        delete init.compress
        resp = await fetch(input, init)
    } catch (error){
        console.warn(error)  // Log error as can rarely fail for bad args and not just network fail
        throw new MustReconnect(url)
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
        throw new RequestErrorStatus(url, resp.status)
    }

    // Try and read response if configured to
    if (!read_body){
        return resp
    }
    try {
        return await resp[read_body]() as unknown
    } catch {
        throw new RequestErrorBody(url)
    }
}


// SHORTCUTS


export function request_json<T>(input:string|Request, init?:JsonRequestInit){
    // Request this type of response and throw if don't get it
    return request<T>(input, init ?? {}, 'json', 'throw')
}


export function request_text(input:string|Request, init?:JsonRequestInit){
    // Request this type of response and throw if don't get it
    return request(input, init ?? {}, 'text', 'throw')
}


export function request_blob(input:string|Request, init?:JsonRequestInit){
    // Request this type of response and throw if don't get it
    return request(input, init ?? {}, 'blob', 'throw')
}


export function request_buffer(input:string|Request, init?:JsonRequestInit){
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
    if (!(error instanceof MustReconnect)){
        self.app_report_error(error)
    }
}

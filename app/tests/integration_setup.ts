
// Setup run before every integration test file (in addition to unit_setup.ts)

import {FetchHttpHandler} from '@smithy/fetch-http-handler'


// AWS SDK's node build can't read a Blob body, which FetchHttpHandler returns when a response has
// no body (e.g. HEAD 404), whereas the app uses the browser build which can
// So convert such bodies to a ReadableStream which both builds support
const original_handle = FetchHttpHandler.prototype.handle
FetchHttpHandler.prototype.handle = async function(...args){
    const result = await original_handle.apply(this, args)
    const body:unknown = result.response.body
    if (body instanceof Blob){
        result.response.body = body.stream()
    }
    return result
}

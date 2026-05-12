
import {FetchHttpHandler} from '@smithy/fetch-http-handler'
import type {HttpRequest} from '@smithy/protocol-http'
import type {HttpHandlerOptions, MiddlewareStack} from '@smithy/types'

import {MustReconnect, MustSyncClock} from '../utils/exceptions'
import {sleep} from '@/services/utils/async'


export interface HostCredentialsAws {
    accessKeyId:string
    secretAccessKey:string
    sessionToken?:string
}


export interface HostStorageGeneratedAws {
    credentials:HostCredentialsAws
    api_id?:string|undefined  // Present for 'aws' but not 'gracious'
}


export class StorageBaseAws {

    constructor(public bucket:string, public region:string){}

    get _bucket_id():string{
        return this.bucket
    }

    get _bucket_arn():string{
        return `arn:aws:s3:::${this.bucket}`
    }

    get _bucket_domain():string{
        return `${this.bucket}.s3-${this.region}.amazonaws.com`
    }

    get _bucket_resp_id():string{
        return `${this.bucket}-stello-resp`
    }

    get _bucket_resp_arn():string{
        return `arn:aws:s3:::${this._bucket_resp_id}`
    }

    get _user_id():string{
        return `stello-${this.bucket}`
    }

    get _topic_id():string{
        return `stello-${this.bucket}`
    }

    get _lambda_id():string{
        return `stello-${this.bucket}`
    }

    get _lambda_role_id():string{
        return `stello-${this.bucket}-lambda`
    }

    get _lambda_boundary_id():string{
        return `stello-${this.bucket}-lambda-boundary`
    }
}


// Standard wait time
// NOTE Occasionally hit timeout for bucket creation when set to 30 seconds, so doubled to 60
// NOTE casing matches property casing allowing easier insertion
export const maxWaitTime = 60


interface _AwsError extends Error {
    // The error object usually thrown by AWS SDK
    // NOTE All props optional in case not actually an AWS error
    $metadata?:{
        httpStatusCode?:number
    }
}

export type AwsError = _AwsError|null  // Null in case not actually an AWS error


export async function no404<T>(request:Promise<T>):Promise<T|undefined>{
    // Helper for ignoring 404 errors (which usually signify already deleted)
    return request.catch((error:AwsError) => {
        if (error?.$metadata?.httpStatusCode === 404){
            return undefined  // Ignoring 404s
        }
        throw error
    })
}


export class RequestHandler extends FetchHttpHandler {
    // Extend FetchHttpHandler to turn generic fetch errors into MustReconnect
    override async handle(request:HttpRequest, options:HttpHandlerOptions|undefined){
        try {
            return await super.handle(request, options)
        } catch (error){
            console.error(error)  // Small chance of error other than network, so log
            throw new MustReconnect(request.path)
        }
    }
}


export function add_clock_skew_middleware(client:{middlewareStack:MiddlewareStack<object, object>}){
    // Retry RequestTimeTooSkewed once then throw MustSyncClock
    client.middlewareStack.add((next, context) => {
        return async (args) => {
            try {
                return await next(args)
            } catch (error) {

                // If not a clock stew error, simply rethrow
                if ((error as AwsError)?.name !== 'RequestTimeTooSkewed') {
                    throw error
                }

                // AWS SDK has built-in retry with clock correction offset.
                // Since RequestTimeTooSkewed was raised and not auto-corrected, it's likely this
                // was an initial parallel request that fired before the correction could happen.
                // When it returns the client thinks it tried with the corrected time but actually
                // didn't have access to the correction when it was first sent.
                // So wait a second to ensure first request done and time corrected and retry
                await sleep(1000)
                try {
                    return await next(args)
                } catch (retry_error) {
                    if ((retry_error as AwsError)?.name === 'RequestTimeTooSkewed') {
                        // Throw special error so can show explanation in UI
                        throw new MustSyncClock()
                    }
                    throw retry_error  // Something else
                }
            }
        }
    }, {
        name: 'clock_skew_handler',
        // Add at low priority so it wraps all other middleware including the SDK's own retry
        priority: 'low',
    })
}

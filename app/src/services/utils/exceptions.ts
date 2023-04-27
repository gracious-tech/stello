

/* GUIDE

Generating stack trace for non-error throws
    You can throw anything in JS, but only error objects include stack traces
        Even builtin exceptions like DOMException don't include a stack trace (crypto throws this)
    So any instances of non-error throws, whether own or other, should be wrapped in an error object
    It isn't wise to create a utility for this as then that will be the first in the stack
        It's clearer to always create the error object as close to the original as possible
        The stack is generated when error object first created (not when rethrown etc)
        It's especially bad to use a utility for promises, as you lose all stack before first await
    Example:
        try {
            await crypto.subtle.decrypt(...)
        } catch (error){
            throw new Error(error)
            // OR: throw error instanceof Error && error.stack ? error : new Error(error)
        }
*/



// EXTENDABLE ERROR


export class CustomError extends Error {
    // Bridge for extending Error while keeping prototype and name
    constructor(message?:string){
        super(message)
        this.name = new.target.name
        Object.setPrototypeOf(this, new.target.prototype)
    }
}


// GENERICS


export class MustReconnect extends CustomError {
    // Use for errors that can be resolved by fixing network connection
}


export class MustReauthenticate extends CustomError {
    // Use for errors that can be resolved by reauthenticating
}


export class MustReconfigure extends CustomError {
    // Use for errors that can be resolved by reconfiguring settings
}


export class MustWait extends CustomError {
    // Use for errors that can be resolved by trying again later (throttled etc)
}


export class MustRecover extends CustomError {
    // Use for missing resource errors that can be resolved by recreating or giving up
}


export class MustInterpret extends CustomError {
    // Use for unknown errors that have data available that could be interpreted
    data:Record<string, unknown>

    constructor(data:Record<string, unknown>){
        // Ensure data available when printed by stringifying as error's message
        super(JSON.stringify(data))
        this.data = data
    }
}


// HELPERS


export function type_of(value:unknown){
    // Extend typeof to support null and Array
    if (value === null){
        return 'null'  // typeof null === 'object' (bug since JS v1)
    } else if (Array.isArray(value)){
        return 'array'  // typeof [] === 'object'
    }
    return typeof value
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TS says can't be unknown :/
export function catch_only(error_class:any, error:unknown):void{
    // Rethrow an error if not of the given class
    if (! (error instanceof error_class)){
        throw error
    }
}


export function silence<A, R>(fn:(...args:A[])=>R, args:A[]=[]):R|undefined{
    // Call given function and silence any errors that occur
    try {
        return fn(...args)
    } catch {}
    return undefined
}


export async function drop<T>(promise:Promise<T>):Promise<T|undefined>{
    // Drop (rather than catch) any errors for promise (resolving to undefined instead)
    return promise.catch(() => undefined)
}


export function validate_chars(value:string, regex_chars:string):void{
    // Ensure value only contains given chars (in regex syntax)
    // WARN Use double \\ in regex_chars since initing via a normal string rather than regex string
    const regex = new RegExp(`^[${regex_chars}]*$`)
    if (!regex.test(value)){
        throw new Error(`Invalid characters in: ${value}`)
    }
}


export function error_to_string(error:unknown):string{
    // Since thrown errors can be any object in JS, need to carefully extract info from them

    // Determine type of error (useful for knowing why can't extract more info from e.g. a string)
    // NOTE Constructor name important for custom error classes (3rd party or own) which may not
    //      inherit from Error properly
    let type:string = typeof error
    if (type === 'object'){
        type = (error as object)?.constructor?.name || 'object'
    }

    // Try get more info
    let info = ''
    try {
        if (error instanceof Error){
            // NOTE `error.name` will be same as constructor name already included above
            info = `${error.message}\n\n${error.stack!}`
        } else if (typeof error === 'object'){
            info = JSON.stringify(error, undefined, 4)
        } else {
            info = String(error)
        }
    } catch {
        // Never fail
    }

    return `Error type: ${type}\n${info}`
}


export function ensure_string(value:unknown, null_if_empty?:false):string
export function ensure_string(value:unknown, null_if_empty:true):string|null
export function ensure_string(value:unknown, null_if_empty=false){
    // Ensure a value is a string and throw if not (optionally use null for empty value)
    if (!value){
        return null_if_empty ? null : ''
    } else if (typeof value !== 'string'){
        throw Error("Value is not a string")
    }
    return value
}

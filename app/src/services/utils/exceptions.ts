
// GENERICS


export class MustReconnect extends Error {
    // Use for errors that can be resolved by fixing network connection
}


export class MustReauthenticate extends Error {
    // Use for errors that can be resolved by reauthenticating
}


export class MustReconfigure extends Error {
    // Use for errors that can be resolved by reconfiguring settings
}


export class MustRecover extends Error {
    // Use for missing resource errors that can be resolved by recreating or giving up
}


export class MustInterpret extends Error {
    // Use for unknown errors that have data available that could be interpreted
    data:Record<string, any>

    constructor(data:Record<string, any>){
        // Ensure data available when printed by stringifying as error's message
        super(JSON.stringify(data))
        this.data = data
    }
}


// HELPERS


export function type_of(value:any):string{
    // Extend typeof to support null and Array
    if (value === null){
        return 'null'  // typeof null === 'object' (bug since JS v1)
    } else if (Array.isArray(value)){
        return 'array'  // typeof [] === 'object'
    }
    return typeof value
}


export function catch_only(error_class:any, error:Error):void{
    // Rethrow an error if not of the given class
    if (! (error instanceof error_class)){
        throw error
    }
}


export function silence<A, R>(fn:(...args:A[])=>R, args:A[]=[]):R{
    // Call given function and silence any errors that occur
    try {
        return fn(...args)
    } catch {}
}


export function drop<T>(promise:Promise<T>):Promise<T>{
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


export function error_to_string(error:any):string{
    // Since thrown errors can be any object in JS, need to carefully extract info from them

    // Determine type of error (useful for knowing why can't extract more info from e.g. a string)
    // NOTE Constructor name important for custom error classes (3rd party or own) which may not
    //      inherit from Error properly
    let type = typeof error
    if (type === 'object'){
        type = error?.constructor?.name || 'object'
    }

    // Try get more info
    let info = ''
    try {
        if (error instanceof Error){
            // NOTE `error.name` will be same as constructor name already included above
            info = `${error.message}\n\n${error.stack}`
        } else if (typeof error === 'object'){
            info = JSON.stringify(error, undefined, 4)
        } else {
            info = '' + error
        }
    } catch {}

    return `Error type: ${type}\n${info}`
}

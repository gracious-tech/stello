
// GENERICS


export class MustReconnect extends Error {
    // Use for errors that can be resolved by fixing network connection
}


export class MustReauthenticate extends Error {
    // Use for errors that can be resolved by reauthenticating
}


export class MustRecover extends Error {
    // Use for missing resource errors that can be resolved by recreating or giving up
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


export function validate_chars(value:string, regex_chars:string):void{
    // Ensure value only contains given chars (in regex syntax)
    // WARN Use double \\ in regex_chars since initing via a normal string rather than regex string
    const regex = new RegExp(`^[${regex_chars}]*$`)
    if (!regex.test(value)){
        throw new Error(`Invalid characters in: ${value}`)
    }
}


export function enforce_range(value:unknown, smallest:number, largest:number, default_?:number){
    // Force value to be a number within given range
    if (typeof value !== 'number'){
        return default_ === undefined ? smallest : default_
    }
    return Math.min(largest, Math.max(smallest, value))
}


export function parse_int(value:unknown):number|null{
    // Version of parseInt that returns null if invalid (NaN can't be used in JSON)
    const number = typeof value === 'number' ? value :
        (typeof value === 'string' ? Number.parseInt(value, 10) : null)
    return Number.isNaN(number) ? null : number
}


export function parse_float(value:unknown):number|null{
    // Version of parseFloat that returns null if invalid (NaN can't be used in JSON)
    const number = typeof value === 'number' ? value :
        (typeof value === 'string' ? Number.parseFloat(value) : null)
    return Number.isNaN(number) ? null : number
}

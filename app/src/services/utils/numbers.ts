
export function enforce_range(value:unknown, smallest:number, largest:number, default_?:number){
    // Force value to be a number within given range
    if (typeof value !== 'number'){
        return default_ === undefined ? smallest : default_
    }
    return Math.min(largest, Math.max(smallest, value))
}


export function parse_int(value:string|number):number|null{
    // Version of parseInt that returns null if invalid (NaN can't be used in JSON)
    const result = typeof value === 'number' ? value : Number.parseInt(value, 10)
    return Number.isNaN(result) ? null : result
}


export function parse_float(value:string|number):number|null{
    // Version of parseFloat that returns null if invalid (NaN can't be used in JSON)
    const result = typeof value === 'number' ? value : Number.parseFloat(value)
    return Number.isNaN(result) ? null : result
}

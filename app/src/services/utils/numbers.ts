
export function enforce_range(value:unknown, smallest:number, largest:number, default_?:number){
    // Force value to be a number within given range
    if (typeof value !== 'number'){
        return default_ === undefined ? smallest : default_
    }
    return Math.min(largest, Math.max(smallest, value))
}


export function parse_int(value:unknown):number|null{
    // More flexible version of parseInt that returns null if invalid (NaN can't be used in JSON)
    const number = typeof value === 'number' ? value :
        (typeof value === 'string' ? Number.parseInt(value.replace(/[^\d.-]/g, ''), 10) : null)
    return Number.isNaN(number) ? null : number
}


export function parse_float(value:unknown):number|null{
    // More flexible version of parseFloat that returns null if invalid (NaN can't be used in JSON)
    const number = typeof value === 'number' ? value :
        (typeof value === 'string' ? Number.parseFloat(value.replace(/[^\d.-]/g, '')) : null)
    return Number.isNaN(number) ? null : number
}


export function mimic_formatting(model:string, value:number){
    // Format a number in a way that mimics the formatting of an existing number string
    // WARN Not an exact science and result may still be malformed so rely on for display only
    // e.g. ('$.1', -2) => '-$2', ('-1%', 2) => '2%'

    // Get all chars up to first digit and remove any '-' or '.' among them
    const prefix = (model.match(/([\D]*)/)?.[1] ?? '').replace(/[.-]*/g, '')
    // Get all chars after last digit and remove any '-' or '.' among them
    const suffix = (model.match(/.*[\d](.*)/)?.[1] ?? '').replace(/[.-]*/g, '')
    // Determine if negative sign needed
    const minus = value < 0 ? '-' : ''
    // Convert absolute number to string with thousand separators
    // NOTE toLocaleString may be unpredictable but with just a raw positive number should be ok
    const number = Math.abs(value).toLocaleString()
    // Put together
    return `${minus}${prefix}${number}${suffix}`
}

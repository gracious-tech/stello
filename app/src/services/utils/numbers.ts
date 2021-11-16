
export function enforce_range(value:unknown, smallest:number, largest:number, default_?:number){
    // Force value to be a number within given range
    if (typeof value !== 'number'){
        return default_ === undefined ? smallest : default_
    }
    return Math.min(largest, Math.max(smallest, value))
}

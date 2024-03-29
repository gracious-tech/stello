

export function sort(array:any[], property:string|number|null=null, ascending=true):void{
    /* Improved sorting of arrays
        1. Supports string/number/date comparison (builtin sort converts all to strings)
        2. Supports any-case and locale-specific sorting for strings
        3. Can sort based on a property/index if items are objects/arrays
    */

    // If empty, nothing to sort, and can't check first value's type, so return now
    if (!array.length)
        return

    // Check type of first value so know what comparison to do
    const first_val = property === null ? array[0] : array[0][property]
    let compare:(a:any, b:any)=>number
    if (typeof first_val === 'number'){
        compare = (a:number, b:number):number => a - b
    } else if (first_val instanceof Date){
        compare = (a:Date, b:Date):number => a.getTime() - b.getTime()
    } else {
        const _collator = new Intl.Collator()  // So don't construct on every call to `compare()`
        compare = (a, b) => _collator.compare(a, b)
    }

    // Reverse comparison if decending order
    if (!ascending){
        const orig_compare = compare
        compare = (a, b) => orig_compare(b, a)
    }

    // Do the sorting
    array.sort((a:any, b:any) => {
        if (property !== null){
            // Compare based on property if one given
            a = a[property]
            b = b[property]
        }
        return compare(a, b)
    })
}


function _remove<T>(array:T[], checker:(item:T)=>any, single:boolean):T[]{
    // Remove items from array whose return from checker fn is truthy and return removed items
    const removed:T[] = []
    for (let i = array.length - 1; i >= 0; i--){
        if (checker(array[i]!)){
            removed.push(...array.splice(i, 1))
            if (single){
                break
            }
        }
    }
    return removed
}


export function remove_item<T>(array:T[], item:T):boolean{
    // Remove given item from the array and return whether item existed
    // NOTE Does not remove more than one item if duplicates
    // WARN May want to use `remove_value` for small arrays in case duplicates
    return _remove(array, array_item => array_item === item, true).length > 0
}


export function remove_value<T>(array:T[], value:T):number{
    // Remove given value from all of the array and return how many times removed
    return _remove(array, array_item => array_item === value, false).length
}


export function remove_match<T>(array:T[], checker:(item:T)=>any):T|undefined{
    // Remove first item that matches checker fn and return it (undefined if none)
    // WARN May want to use `remove_matches` for small arrays in case duplicates
    return _remove(array, checker, true)[0]
}


export function remove_matches<T>(array:T[], checker:(item:T)=>any):T[]{
    // Remove items that match checker fn and return them (empty array if none)
    return _remove(array, checker, false)
}


export function get_last<T>(array:T[]):T|undefined{
    // Return the last item in the array, or undefined (useful when array name very long)
    return array[array.length-1]
}

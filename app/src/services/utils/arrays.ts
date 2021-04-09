

export function sort(array:string[]|number[]|object[], property:string=null, ascending:boolean=true,
        ):void{
    /* Improved sorting of arrays
        1. Supports string/number/date comparison (builtin sort converts all to strings)
        2. Supports any-case and locale-specific sorting for strings
        3. Can sort based on a property if items are objects
    */

    // If empty, can't check first value's type, so return now
    if (!array.length)
        return

    // Check type of first value so know what comparison to do
    const first_val = property ? array[0][property] : array[0]
    const subtractable = typeof first_val === 'number' || first_val instanceof Date
    let compare = subtractable ? (a, b) => a - b : new Intl.Collator().compare

    // Reverse comparison if decending order
    if (!ascending){
        const orig_compare = compare
        compare = (a, b) => orig_compare(b, a)
    }

    // Do the sorting
    array.sort((a, b) => {
        if (property){
            // Compare based on property if one given
            a = a[property]
            b = b[property]
        }
        return compare(a, b)
    })
}


// Default comparer for `remove()` that expects array items and item arg to be of same type
const remove_default_comparer = <T>(array_item:T, item:T) => array_item === item

export function remove<AT, IT>(array:AT[], item:IT,
        comparer:(array_item:AT, item:IT)=>boolean=remove_default_comparer as any):void{
    // Remove all instances of an item from an array
    // NOTE Comparer fn can optionally be given for more complicated comparisons
    for (let i = array.length - 1; i >= 0; i--){
        if (comparer(array[i], item)){
            array.splice(i, 1)
        }
    }
}


export function get_last(array:any[]):any{
    // Return the last item in the array, or undefined (useful when array name very long)
    return array[array.length-1]
}

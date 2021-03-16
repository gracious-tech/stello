

export function sort(array:any[], property:string=null, ascending:boolean=true):void{
    // Sort an array by value and optionally by a property (if values are objects)
    // NOTE Regular array sort converts all values to strings first, so numerical sorting fails
    array.sort((a, b) => {
        if (property){
            a = a[property]
            b = b[property]
        }
        if (a === b){
            return 0
        }
        const comparison = ascending ? a > b : a < b
        return comparison ? 1 : -1
    })
}


export function remove(array:any[], item:any, comparer:(a, b)=>boolean=(a, b)=>a === b):void{
    // Remove all instances of an item from an array
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

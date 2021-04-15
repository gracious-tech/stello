
import {type_of} from './exceptions'


export class NestedKeyMissing extends Error {
    name = 'NestedKeyMissing'
}


export class NestedStructureChanged extends Error {
    name = 'NestedStructureChanged'
}


export function nested_objects_set(container:Record<string, any>, keys:string[], value:any):void{
    // Set a value in a nested set of objects
    // NOTE Doesn't allow adding new properties (important as Vue wouldn't be able to detect)

    // Avoid changing keys array
    keys = keys.slice()

    // Traverse the container until only one key remains
    while (keys.length > 1){
        const key = keys.shift() as string
        container = container[key]
        if (container === undefined){
            throw new NestedKeyMissing(key)
        }
    }

    // Set value
    if (keys[0] in container){
        container[keys[0]] = value
    } else {
        throw new NestedKeyMissing(keys[0])
    }
}


export function nested_objects_update(base:Record<string, any>, update:Record<string, any>):void{
    // Do a deep update of a base object by merging in values from the given update object
    // Update can be partial but can't add new keys, and can't change structure of base
    // Intended use case is merging in changes from an API response
    //     If object merely replaced, Vue will rerender DOM even if no values have changed
    //     See https://stackoverflow.com/questions/61653210/

    for (const [key, new_val] of Object.entries(update)){

        // Don't allow adding new keys (bad practice, and Vue won't detect changes)
        const old_val = base[key]
        if (old_val === undefined){
            throw new NestedKeyMissing(key)
        }

        // Skip if value hasn't changed
        if (new_val === old_val){
            continue
        }

        // Don't allow changing structure (replacing an object|array with another type)
        const new_type = type_of(new_val)
        const old_type = type_of(old_val)
        if (new_type !== old_type && ['object', 'array'].includes(old_type)){
            throw new NestedStructureChanged(key)
        }

        // Go deeper if an object, otherwise update the value
        // NOTE Arrays are simply replaced, as too complicated to merge
        if (old_type === 'object'){
            nested_objects_update(base[key], update[key])
        } else {
            base[key] = new_val
        }
    }
}


export function sorted_json(object:Record<string, any>):string{
    // Return an idempotent JSON string by ensuring keys are sorted
    // NOTE Does not support objects as values (i.e. nested within root object)

    // Get sorted list of keys
    const keys = Object.keys(object)
    keys.sort()

    // Get jsonified key:value items but without commas or outer braces
    const parts = []
    for (const key of keys){
        const tmp_object:Record<string, any> = {}
        tmp_object[key] = object[key]
        const naked_kv = JSON.stringify(tmp_object).trim().slice(1, -1)
        parts.push(naked_kv)
    }

    // Join parts to form valid json string
    return '{' + parts.join(',') + '}'
}

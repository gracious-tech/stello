
import {CustomError, type_of} from './exceptions'


export class NestedKeyMissing extends CustomError {
    override name = 'NestedKeyMissing'
}


export class NestedStructureChanged extends CustomError {
    override name = 'NestedStructureChanged'
}


export function nested_objects_set(container:unknown, keys:MinOne<string>, value:unknown):void{
    // Set a value in a nested set of objects
    // NOTE Doesn't allow adding new properties (important as Vue wouldn't be able to detect)
    // NOTE container:unknown due to https://github.com/microsoft/TypeScript/issues/15300

    // Avoid changing keys array
    keys = keys.slice() as MinOne<string>

    // Work through the keys
    while (keys.length > 0){
        const key = keys.shift()!

        // If container is not an object, can't set value or traverse any further
        if (typeof container !== 'object' || container === null){
            throw new NestedKeyMissing(key)
        }

        // If the last key, set the value, otherwise go deeper
        if (keys.length === 0){
            (container as Record<string, unknown>)[key] = value
        } else {
            container = (container as Record<string, unknown>)[key]
        }
    }
}


export function nested_objects_update(base:Record<string, unknown>, update:Record<string, unknown>)
        :void{
    // Do a deep update of a base object by merging in values from the given update object
    // Update can be partial but can't add new keys, and can't change structure of base
    // Intended use case is merging in changes from an API response
    //     If object merely replaced, Vue will rerender DOM even if no values have changed
    //     See https://stackoverflow.com/questions/61653210/

    for (const [key, new_val] of Object.entries(update)){

        // Don't allow adding new keys (bad practice, and Vue won't detect changes)
        if (! {}.hasOwnProperty.call(base, key)){
            throw new NestedKeyMissing(key)
        }

        // Skip if value hasn't changed
        const old_val = base[key]
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
            nested_objects_update(
                base[key] as Record<string, unknown>,
                update[key] as Record<string, unknown>,
            )
        } else {
            base[key] = new_val
        }
    }
}

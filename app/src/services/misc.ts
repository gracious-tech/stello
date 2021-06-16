// Utils that have dependencies or are app-specific

import {debounce} from 'lodash'
import {VSelect} from 'vuetify/lib/components/VSelect'
import {VAutocomplete} from 'vuetify/lib/components/VAutocomplete'
import {formatDistanceStrict} from 'date-fns'


// SECTION SIZES

const PIXELS_WIDTH_HANDHELD = 1242  // Current top range (iPhone 11 Pro Max)
const SECTION_WIDTH_FULL = 700
const ZOOM_FACTOR = 2
// Let max image size be either highend device width OR desktop full width zoomed in
export const SECTION_IMAGE_WIDTH = Math.max(PIXELS_WIDTH_HANDHELD, SECTION_WIDTH_FULL * ZOOM_FACTOR)


// OTHER

export const VAutoOrSelect = (() => {
    // Return either an autocomplete or a select component depending on viewport height
    // Autocomplete useful to filter long lists, but opens a keyboard on mobiles resulting in bad UX
    const keyboard_height = 260
    const autocomplete_desired_height = 550
    const required_height = keyboard_height + autocomplete_desired_height
    return self.innerHeight > required_height ? VAutocomplete : VSelect
})()


export const debounce_default_ms = 500


export function debounce_method(ms=debounce_default_ms){
    // Debounce decorator for methods
    // See https://www.typescriptlang.org/docs/handbook/decorators.html#method-decorators
    return (that, name, descriptor) => {
        descriptor.value = debounce(descriptor.value, ms)
    }
}


export function debounce_set(ms=debounce_default_ms){
    // Debounce decorator for `set` accessors
    // See https://www.typescriptlang.org/docs/handbook/decorators.html#accessor-decorators
    // NOTE Only one decorator can be used for each accessor name (whether get or set)
    return (that, name, descriptor) => {
        descriptor.set = debounce(descriptor.set, ms)
    }
}


export function debug(arg:any){
    // Log a debug message in console if not production (as may be frequent and bad for performance)
    if (process.env.NODE_ENV !== 'production'){
        console.debug(arg)  // tslint:disable-line:no-console
    }
}


export function time_between(date:Date, comparator:Date=new Date(), tense=true):string{
    // Format a date relative to comparator (which defaults to now)
    // NOTE "strict" version isn't really strict, and is better described as "vague"
    //      as it doesn't specify if "around" an amount or exactly the amount
    // NOTE addSuffix adds "ago" suffix if in past, and "in" prefix if in future
    return formatDistanceStrict(date, comparator, {addSuffix: tense})
}

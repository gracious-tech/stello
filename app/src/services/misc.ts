// Utils that have dependencies or are app-specific

// Import worker as a separate script (rather than blob which is forbidden by CSP)
import UntarWorker from 'js-untar/src/untar-worker.js?worker'

import {debounce as lodash_debounce} from 'lodash'
import {formatDistanceStrict} from 'date-fns'


// SECTION SIZES

const PIXELS_WIDTH_HANDHELD = 1242  // Current top range (iPhone 11 Pro Max)
const SECTION_WIDTH_FULL = 700
const ZOOM_FACTOR = 2
// Let max image size be either highend device width OR desktop full width zoomed in
export const SECTION_IMAGE_WIDTH = Math.max(PIXELS_WIDTH_HANDHELD, SECTION_WIDTH_FULL * ZOOM_FACTOR)


// OTHER

export const debounce_default_ms = 500


export function debounce<T>(fn:T, ms=debounce_default_ms){
    // Version of lodash debounce that has own defaults
    // @ts-ignore -- Lodash uses 'any' types and can't work out how to declare unknown args fn
    return lodash_debounce(fn, ms) as unknown as T
}


export function debounce_method(ms=debounce_default_ms){
    // Debounce decorator for methods
    // See https://www.typescriptlang.org/docs/handbook/decorators.html#method-decorators
    return (that:unknown, name:string, descriptor:PropertyDescriptor) => {
        descriptor.value = debounce(descriptor.value as unknown, ms)
    }
}


export function debounce_set(ms=debounce_default_ms){
    // Debounce decorator for `set` accessors
    // See https://www.typescriptlang.org/docs/handbook/decorators.html#accessor-decorators
    // NOTE Only one decorator can be used for each accessor name (whether get or set)
    return (that:unknown, name:string, descriptor:PropertyDescriptor) => {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        descriptor.set = debounce(descriptor.set, ms)
    }
}


export function debug(arg:any){
    // Log a debug message in console if not production (as may be frequent and bad for performance)
    if (import.meta.env.MODE !== 'production'){
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


// Lifespan options used in exported lifespan methods
const lifespan_options = [
    // Precise up to 10 days
    {value: 1, text: '1 day'},
    {value: 2, text: '2 days'},
    {value: 3, text: '3 days'},
    {value: 4, text: '4 days'},
    {value: 5, text: '5 days'},
    {value: 6, text: '6 days'},
    {value: 7, text: '7 days'},
    {value: 8, text: '8 days'},
    {value: 9, text: '9 days'},
    {value: 10, text: '10 days', divider: true},
    // Precise weeks up to 6
    {value: 2*7, text: '2 weeks'},
    {value: 3*7, text: '3 weeks'},
    {value: 4*7, text: '4 weeks'},
    {value: 5*7, text: '5 weeks'},
    {value: 6*7, text: '6 weeks', divider: true},
    // Precise months up to 6
    {value: 2*30, text: '2 months'},
    {value: 3*30, text: '3 months'},
    {value: 4*30, text: '4 months'},
    {value: 5*30, text: '5 months'},
    {value: 6*30, text: '6 months'},
    {value: 9*30, text: '9 months', divider: true},  // Fill gap between 1/2 and 1 year
    // Less precise up to 2 years
    {value: 365, text: '1 year'},
    {value: 365+182, text: '1½ years'},
    {value: 365*2, text: '2 years'},
    {value: Infinity, text: 'No expiry'},
]


export function generate_lifespan_options(max_lifespan=Infinity){
    // Generate lifespan options for use with v-select, optionally limiting
    return lifespan_options.filter(item => item.value <= max_lifespan)
}


export function lifespan_days_to_text(days:number){
    // Return UI text for given lifespan days
    // NOTE Ensures consistent rather than using 3rd party lib that might count months etc different
    const item = lifespan_options.find(item => item.value === days)
    return item ? item.text : `${days} days`
}


type TarFile = {name:string, type:string, buffer:ArrayBuffer}

export function untar(tar_file:ArrayBuffer):Promise<TarFile[]>{
    // Custom wrapping of js-untar worker to avoid blob url for CSP sake
    return new Promise(function(resolve, reject){

        // Collect extracted files (passed to resolve when all files extracted)
        const files:TarFile[] = []

        // Create worker using vite-specific constructor that uses actual script rather than blob
        const worker = new UntarWorker()
        worker.onerror = reject

        // Handle worker events
        worker.onmessage = function(event){
            const message = event.data as {type:string, data:unknown}
            if (message.type === 'extract'){
                files.push(message.data as TarFile)
            } else if (message.type === 'complete'){
                worker.terminate()
                resolve(files)
            } else {
                worker.terminate()
                reject(new Error(message.type))
            }
        }

        // Send tar data to worker to start extraction
        worker.postMessage({type: 'extract', buffer: tar_file}, [tar_file])
    })
}

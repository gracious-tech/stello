// Utils that have dependencies or are app-specific

import MediumEditor from 'medium-editor'
import {debounce} from 'lodash'
import {VSelect} from 'vuetify/lib/components/VSelect'
import {VAutocomplete} from 'vuetify/lib/components/VAutocomplete'
import {formatDistanceToNow} from 'date-fns'

import svgs from '@/assets/svgs'


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


export function activate_editor(elements){
    // Activate elements as editable and enable visual editor toolbar (returns deactivator)
    // WARN Ensure returned deactivator is called as MediumEditor won't cleanup automatically
    // NOTE elements arg takes same options as MediumEditor (single/multiple, string/elements)
    // NOTE Editor cannot be init'd without any elements, so must init upon first use instead
    //      https://github.com/yabwe/medium-editor/issues/1260

    // If editor already exists, simply add given elements to it
    if (self._editor){
        self._editor.addElements(elements)
    } else {
        // Editor doesn't exist yet, so init with given elements
        self._editor = new MediumEditor(elements, {
            autoLink: true,
            targetBlank: true,
            imageDragging: false,
            toolbar: {
                buttons: [
                    {name: 'bold', contentDefault: svgs.icon_format_bold},
                    {name: 'italic', contentDefault: svgs.icon_format_italic},
                    {name: 'anchor', contentDefault: svgs.icon_link},
                    {name: 'h1', contentDefault: svgs.icon_title},
                    {name: 'h2', contentDefault: svgs.icon_text_fields},
                    {name: 'orderedlist', contentDefault: svgs.icon_list_numbered},
                    {name: 'unorderedlist', contentDefault: svgs.icon_list_bulleted},
                    {name: 'quote', contentDefault: svgs.icon_format_quote},
                ],
            },
            placeholder: {
                // WARN Hiding on click can result in buggy focus issue
                // See https://github.com/yabwe/medium-editor/issues/1560
                hideOnClick: false,
            },
        })
    }

    // Return deactivator
    return () => {self._editor.removeElements(elements)}
}


export function format_date_relative(date:Date):string{
    // Format a date relative to now
    return formatDistanceToNow(date, {addSuffix: true})
}


export function format_date_exact(date:Date):string{
    // Format a date with all elements included
    return date.toLocaleString()
}

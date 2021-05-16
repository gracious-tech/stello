
export function partition(original:string, separator:string):[string, string]{
    // Split string at separator at first occurance only and return both sides (excluding separator)
    const a = original.split(separator, 1)[0] || ''
    const b = original.slice((a + separator).length)
    return [a, b]
}


export function replace_without_overlap(template:string, replacements:Record<string, string>,
        ):string{
    // Replace a series of values without replacing any values inserted from a previous replacement
    // e.g. if "SUBJECT" is replaced with "CONTACT ME", it will not match another key like "CONTACT"

    // First replace placeholders with versions with near zero probability of overlap
    for (const placeholder of Object.keys(replacements)){
        template = template.replaceAll(placeholder, `~~NEVER~~${placeholder}~~MATCH~~`)
    }

    // Now safe(r) to replace with actual values
    for (const [placeholder, value] of Object.entries(replacements)){
        template = template.replaceAll(`~~NEVER~~${placeholder}~~MATCH~~`, value)
    }

    return template
}


export function escape_for_html(input:string):string{
    // Escape given text for use within HTML
    // NOTE Option element's constructor's first arg is converted to a text node
    return new Option(input).innerHTML
}

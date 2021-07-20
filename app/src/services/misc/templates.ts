
import {addDays, formatDistanceStrict} from 'date-fns'


export interface VariableProps {
    label:string
    value:string|null
}


export type TemplateVariables = Record<string, VariableProps>


export function gen_variable_items(contact_hello:string|null, contact_name:string|null,
        sender_name:string|null, title:string|null, published:Date, max_reads:number,
        lifespan:number):TemplateVariables{
    // Generate variable items with actual values for all possible variables

    // Work out expiry values
    let expires_date_str = '[no expiry]'
    let expires_time_till = '[no expiry]'
    if (lifespan !== Infinity){
        const expiry_date = addDays(published, lifespan)
        expires_date_str = expiry_date.toLocaleDateString()
        expires_time_till = formatDistanceStrict(expiry_date, published)
    }

    // Return items
    return {
        contact_hello: {
            label: "Contact's name",
            value: contact_hello,
        },
        contact_name: {
            label: "Contact's full name",
            value: contact_name,
        },
        sender_name: {
            label: "Sender's name",
            value: sender_name,
        },
        msg_title: {
            label: "Subject",
            value: title,
        },
        msg_published_date: {
            label: "Date sent",
            value: published.toLocaleDateString(),
        },
        msg_published_time: {
            label: "Time sent",
            value: published.toLocaleTimeString('en', {timeStyle: 'short'}),  // No seconds
        },
        msg_max_reads: {
            label: "Max opens",
            value: msg_max_reads_value(max_reads),
        },
        msg_lifespan: {
            label: "Time till expires",
            value: expires_time_till,
        },
        msg_expires_date: {
            label: "Date expires",
            value: expires_date_str,
        },
    }
}


export function update_template_values(html:string, context:Record<string, {value:string|null}>,
        empty?:string):string{
    // Update the values of template variables (preserves the actual spans and ids)
    // NOTE If a value is missing from context it is set to empty (but only if defined)
    const dom = new DOMParser().parseFromString(html, 'text/html')
    for (const element of dom.querySelectorAll('[data-mention]')){
        const key = element.attributes.getNamedItem('data-id').value
        if (key in context || empty !== undefined){
            element.textContent = context[key]?.value || empty
        }
    }
    return dom.body.innerHTML  // Doesn't include body tag which is auto created by DOMParser
}


export function msg_max_reads_value(max_reads:number):string{
    // Generate a string for the value of msg_max_reads
    return max_reads === Infinity ? '[unlimited]' : `${max_reads}`
}

// Utils that are too hard to categorise


export function address_type(address:string):'url'|'email'|'other'{
    // Return the type of address given
    // SECURITY Only encouraging/supporting secure urls
    if (address.startsWith('https://')){
        return 'url'
    }
    return address.includes('@') ? 'email' : 'other'
}


export async function get_clipboard_blobs(preferred=[]):Promise<Blob[]>{
    // Return clipboard's contents as blobs
    // NOTE May be multiple clipboard items, so an array is returned
    // NOTE Each item may be in multiple formats (e.g. Chrome copy image = [text/html, image/png])
    // TODO Current browser limitations: prompts for permission, only supports text and pngs?
    const items = await self.navigator.clipboard.read()
    return Promise.all(items.map(item => {
        // Each clipboard item can have multiple types, so just return the preferred format
        for (const type_prefix of preferred){
            for (const type of item.types){
                if (type.startsWith(type_prefix)){
                    return item.getType(type)
                }
            }
        }
        // No preferences matched so just return the first
        return item.getType(item.types[0])
    }))
}


export function get_clipboard_text():Promise<string>{
    // A simpler version of `get_clipboard_blobs` (only returns one item which must be text/plain)
    return self.navigator.clipboard.readText()
}


export function email_address_like(input:string):boolean{
    // Whether given input looks like an email address (for UI purposes, not validation)
    return /.+@.+\..+/.test(input)
}

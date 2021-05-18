// Utils that are too hard to categorise


declare global {
    interface ClipboardItem {  // Made up until implemented
        types:string[]
        getType:(type:string)=>Promise<Blob>
    }
    interface Clipboard {  // Extended until additional methods implemented
        read():Promise<ClipboardItem[]>
    }
}


export async function get_clipboard_blobs(preferred=[]):Promise<Blob[]>{
    // Return clipboard's contents as blobs
    // NOTE May be multiple clipboard items, so an array is returned
    // NOTE Each item may be in multiple formats (e.g. Chrome copy image = [text/html, image/png])
    // TODO Current browser limitations: prompts for permission, only supports text and pngs?
    const items = await self.navigator.clipboard.read()
    const blobs = await Promise.all(items.map(item => {
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

    // `getType()` of some items may return null so filter them out
    // e.g. When clipboard empty, a text/plain item may exist but its contents is null
    return blobs.filter(blob => blob)
}


export function get_clipboard_text():Promise<string>{
    // A simpler version of `get_clipboard_blobs` (only returns one item which must be text/plain)
    return self.navigator.clipboard.readText()
}


export function email_address_like(input:string):boolean{
    // Whether given input looks like an email address (for UI purposes, not validation)
    return /.+@.+\..+/.test(input)
}


export function download_file(file:File):void{
    // Trigger a download of the given file
    download_url(URL.createObjectURL(file), file.name)
}


export function download_url(url:string, filename:string=''):void{
    // Trigger a download of the given url
    // NOTE If no filename given the browser will base it on the URL
    const tmp = self.document.createElement('a')
    tmp.href = url
    tmp.download = filename
    tmp.click()
}


export function mailto(address:string='', subject:string='', body:string=''):string{
    // Form a mailto link
    // NOTE Args can be empty strings and the link will still be correctly formed

    // URL size limited by both Chrome/Electron and OS/mail-client, so using a careful figure
    // See https://stackoverflow.com/questions/13317429/
    const char_limit = 1900

    // WARN Not using `URLSearchParams` as it uses `+` for spaces which aren't supported in mailto
    subject = encodeURIComponent(subject)
    body = encodeURIComponent(body)
    // WARN Add body last as it may be cut off if too long
    return `mailto:${address}?subject=${subject}&body=${body}`.slice(0, char_limit)
}

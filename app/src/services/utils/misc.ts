// Utils that are too hard to categorise


export async function get_clipboard_blobs(preferred:string[]=[]):Promise<Blob[]>{
    // Return clipboard's contents as blobs
    // NOTE May be multiple clipboard items, so an array is returned

    // Get clipboard items and extract a blob from each
    // NOTE In some circumstances a DOMException may occur if no data (possibly only on Windows)
    // NOTE This may trigger a CSP warning which is harmless
    //      Browser seems to try to fetch a copied image from its original URL for some reason
    const blobs:Blob[] = []
    for (const item of await self.navigator.clipboard.read().catch(() => [])){

        // Each item may be in multiple formats (e.g. Chrome copy image = [text/html, image/png])
        // Sort so preferred types come first (in preference order), non-preferred types last
        const types_to_try = [...item.types].sort((a, b) => {
            const ai = preferred.findIndex(p => a.startsWith(p))
            const bi = preferred.findIndex(p => b.startsWith(p))
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        })

        for (const type of types_to_try){
            // getType() may return null despite not being in spec
            //     e.g. When clipboard empty, a text/plain item may exist but its contents is null
            // getType() may also throw for some types on some OSs, so ignore and try next if so
            const blob = await item.getType(type).catch(() => null)
            if (blob){
                blobs.push(blob)
                break  // Only return one type of each clipboard item
            }
        }
    }
    return blobs
}


export async function get_clipboard_text():Promise<string|null>{
    // A simpler version of `get_clipboard_blobs` (only returns one item which must be text/plain)
    try {
        return self.navigator.clipboard.readText()
    } catch {
        return null
    }
}


export function email_address_like(input:string):boolean{
    // Whether given input looks like an email address (for UI purposes & bare-minimum validation)
    return /^[^\s@]+@[^\s@]+$/.test(input)
}


export function download_file(file:File):void{
    // Trigger a download of the given file
    // TODO Confirm with actual tests if revoking URL causes issue with the download
    download_url(URL.createObjectURL(file), file.name)
}


export function download_url(url:string, filename=''):void{
    // Trigger a download of the given url
    // NOTE If no filename given the browser will base it on the URL
    const tmp = self.document.createElement('a')
    tmp.href = url
    tmp.download = filename
    tmp.click()
}


export function mailto(address='', subject='', body=''):string{
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

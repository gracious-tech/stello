
import {CustomError} from '@/services/utils/exceptions'


export const HOST_STORAGE_VERSION = 9  // Bump whenever an update to storage services needed


export class HostPermissionError extends CustomError {}


export function validate_subdomain(subdomain:string, min=1, max=63):string|null{
    // Check whether given string is a valid subdomain or not, and return error string if not
    if (subdomain.length < min || subdomain.length > max)
        return `Name must be between ${min} to ${max} characters long`
    if (subdomain[0] === '-' || subdomain.slice(-1) === '-')
        return "Name cannot begin or end with a hyphen"
    if (! /^[A-Za-z0-9-]+$/.test(subdomain))
        return "Name can only contain letters, numbers, and hyphens"
    return null
}


export function displayer_asset_type(path:string):string{
    // Return the mime type of a displayer asset based on its path
    const ext = path.split('.').at(-1)!.toLowerCase()
    switch (ext){
        case 'html':
            return 'text/html'
        case 'json':
            return 'application/json'
        case 'svg':
            return 'image/svg+xml'
        case 'css':
            return 'text/css'
        case 'js':
            return 'text/javascript'
        case 'png':
            return 'image/png'
        case 'jpg':
            return 'image/jpeg'
    }
    return 'application/octet-stream'
}


export function displayer_asset_gzipped(path:string):boolean{
    // Whether a displayer asset is stored gzip compressed (see build_displayer)
    // NOTE Raster images (jpg/png) are left raw since gzipping them gives ~no benefit and breaks
    //      non-browser clients (e.g. Facebook's og:image crawler)
    const ext = path.split('.').at(-1)!.toLowerCase()
    return ext !== 'jpg' && ext !== 'png'
}


import {get_last} from "../utils/arrays"


export function validate_subdomain(subdomain:string, min=1, max=63):string{
    // Check whether given string is a valid subdomain or not, and return error string if not
    if (subdomain.length < min || subdomain.length > max)
        return `Name must be between ${min} to ${max} characters long`
    if (subdomain[0] === '-' || subdomain.slice(-1) === '-')
        return "Name cannot begin or end with a hyphen"
    if (! /^[A-Za-z0-9\-]+$/.test(subdomain))
        return "Name can only contain letters, numbers, and hyphens"
    return null
}


export function displayer_asset_type(path:string):string{
    // Return the mime type of a displayer asset based on its path
    const ext = get_last(path.split('.')).toLowerCase()
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
    }
    return 'application/octet-stream'
}

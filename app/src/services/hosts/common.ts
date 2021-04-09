
export function validate_subdomain(subdomain:string, min:number=1, max:number=63):string{
    // Check whether given string is a valid subdomain or not, and return error string if not
    if (subdomain.length < min || subdomain.length > max)
        return `Name must be between ${min} to ${max} characters long`
    if (subdomain[0] === '-' || subdomain.slice(-1) === '-')
        return "Name cannot begin or end with a hyphen"
    if (! /^[A-Za-z0-9\-]+$/.test(subdomain))
        return "Name can only contain letters, numbers, and hyphens"
    return null
}

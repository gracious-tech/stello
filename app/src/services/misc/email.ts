
import libmime from 'libmime'

import {string_to_utf8} from '@/services/utils/coding'


interface Person {
    name:string
    address:string
}


export function create_email(from:Person, to:Person, subject:string, html:string, reply_to?:Person)
        :ArrayBuffer{
    // Create a simple RFC 2822 compatible email and return as utf8 arraybuffer

    // Encode non-address values in headers to support unicode (since headers must be ascii)
    // NOTE Important to use encodeWord (not encodeWords) for contact names in case <>@, etc
    const from_val = `${libmime.encodeWord(from.name)} <${from.address}>`
    const to_val = `${libmime.encodeWord(to.name)} <${to.address}>`
    const subject_val = libmime.encodeWords(subject)

    // Create the email as an array of lines
    const email = [
        `From: ${from_val}`,
        `To: ${to_val}`,
        `Subject: ${subject_val}`,
        'Content-Type: text/html; charset=UTF-8',
    ]

    // Reply-To header is optional
    if (reply_to){
        const reply_to_val = `${libmime.encodeWord(reply_to.name)} <${reply_to.address}>`
        email.push(`Reply-To: ${reply_to_val}`)
    }

    // Add body
    email.push('', html)  // Empty string to force a newline

    // Return as utf8 arraybuffer (headers ascii already, and body content type declared as utf8)
    return string_to_utf8(email.join('\r\n'))
}

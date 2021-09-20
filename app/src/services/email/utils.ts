
import {encode_contact, encode_subject} from './mime'
import {string_to_utf8} from '@/services/utils/coding'
import {CustomError} from '../utils/exceptions'


interface Person {
    name:string
    address:string
}


export class BadEmailAddress extends CustomError {
    // Raised when sending fails due to rejection of the recipient's address
}


export function create_email(from:Person, to:Person, subject:string, html:string, reply_to?:Person)
        :ArrayBuffer{
    // Create a simple RFC 2822 compatible email and return as utf8 arraybuffer

    // Create the email as an array of lines
    const email = [
        `From: ${encode_contact(from)}`,
        `To: ${encode_contact(to)}`,
        `Subject: ${encode_subject(subject)}`,
        'Content-Type: text/html; charset=UTF-8',
    ]

    // Reply-To header is optional
    if (reply_to){
        email.push(`Reply-To: ${encode_contact(reply_to)}`)
    }

    // Add body
    email.push('', html)  // Empty string to force a newline

    // Return as utf8 arraybuffer (headers ascii already, and body content type declared as utf8)
    return string_to_utf8(email.join('\r\n'))
}


import {encode_contact, encode_subject} from './mime'
import {buffer_to_base64, string_to_utf8} from '@/services/utils/coding'
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
    // Create a simple RFC 5322 compatible email and return as an arraybuffer

    // Create the email as an array of lines
    const email = [
        `From: ${encode_contact(from)}`,
        `To: ${encode_contact(to)}`,
        `Subject: ${encode_subject(subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
    ]

    // Reply-To header is optional
    if (reply_to){
        email.push(`Reply-To: ${encode_contact(reply_to)}`)
    }

    // Add body, base64 encoded so no line exceeds RFC 5322's limit of 998 chars
    // NOTE Each 57 byte chunk encodes to a standard 76 char line
    email.push('')  // Empty string to force a newline
    const body = new Uint8Array(string_to_utf8(html))
    for (let start = 0; start < body.length; start += 57){
        email.push(buffer_to_base64(body.slice(start, start + 57).buffer))
    }

    // Return as arraybuffer (all ascii since headers and body are encoded)
    return string_to_utf8(email.join('\r\n'))
}

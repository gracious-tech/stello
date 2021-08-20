
export function encode_contact(contact:{address:string, name:string}):string{
    // Encode a contact to use in an email header
    return `${_encodeAddressName(contact.name) as string} <${contact.address}>`
}

export function encode_subject(subject:string):string{
    // Encode message subject
    return encodeWords(subject, 'Q', 52, true) as string  // Same settings as nodemailer uses
}


// NODE REPLACEMENTS (so can use nodemailer code in a browser environment)


// Dummy base64 module since isn't used (QP used instead)
const base64 = {encode: (data:unknown) => {throw new Error("Not implemented")}}


// Node's Buffer is a subclass of Uint8Array anyway
const Buffer = {
    from: (string:string, encoding:'utf-8') => new TextEncoder().encode(string),
    byteLength: arg => {throw new Error("Not implemented")},  // Used for base64 encoding only
}


// ALL THAT FOLLOWS EXTRACTED FROM NODEMAILER
// Copyright (c) 2011-2019 Andris Reinman [MIT license]
// It is all untouched aside from adjusting calls to external functions
/* eslint-disable */


// https://github.com/nodemailer/nodemailer/blob/3aca7be0919c6f17b2d18ba8420a6464c7c22be0/lib/mime-node/index.js#L1221
function _encodeAddressName(name) {
    if (!/^[\w ']*$/.test(name)) {
        if (/^[\x20-\x7e]*$/.test(name)) {
            return '"' + name.replace(/([\\"])/g, '\\$1') + '"';
        } else {
            return encodeWord(name, 'Q', 52);
        }
    }
    return name;
}


// https://github.com/nodemailer/nodemailer/blob/3aca7be0919c6f17b2d18ba8420a6464c7c22be0/lib/mime-funcs/index.js#L123
function encodeWords(value, mimeWordEncoding, maxLength, encodeAll){
    maxLength = maxLength || 0;

    let encodedValue;

    // find first word with a non-printable ascii or special symbol in it
    let firstMatch = value.match(/(?:^|\s)([^\s]*["\u0080-\uFFFF])/);
    if (!firstMatch) {
        return value;
    }

    if (encodeAll) {
        // if it is requested to encode everything or the string contains something that resebles encoded word, then encode everything

        return encodeWord(value, mimeWordEncoding, maxLength);
    }

    // find the last word with a non-printable ascii in it
    let lastMatch = value.match(/(["\u0080-\uFFFF][^\s]*)[^"\u0080-\uFFFF]*$/);
    if (!lastMatch) {
        // should not happen
        return value;
    }

    let startIndex =
        firstMatch.index +
        (
            firstMatch[0].match(/[^\s]/) || {
                index: 0
            }
        ).index;
    let endIndex = lastMatch.index + (lastMatch[1] || '').length;

    encodedValue =
        (startIndex ? value.substr(0, startIndex) : '') +
        encodeWord(value.substring(startIndex, endIndex), mimeWordEncoding || 'Q', maxLength) +
        (endIndex < value.length ? value.substr(endIndex) : '');

    return encodedValue;
}


// https://github.com/nodemailer/nodemailer/blob/3aca7be0919c6f17b2d18ba8420a6464c7c22be0/lib/mime-funcs/index.js#L52
function encodeWord(data, mimeWordEncoding, maxLength) {
    mimeWordEncoding = (mimeWordEncoding || 'Q').toString().toUpperCase().trim().charAt(0);
    maxLength = maxLength || 0;

    let encodedStr;
    let toCharset = 'UTF-8';

    if (maxLength && maxLength > 7 + toCharset.length) {
        maxLength -= 7 + toCharset.length;
    }

    if (mimeWordEncoding === 'Q') {
        // https://tools.ietf.org/html/rfc2047#section-5 rule (3)
        encodedStr = qp_encode(data).replace(/[^a-z0-9!*+\-/=]/gi, chr => {
            let ord = chr.charCodeAt(0).toString(16).toUpperCase();
            if (chr === ' ') {
                return '_';
            } else {
                return '=' + (ord.length === 1 ? '0' + ord : ord);
            }
        });
    } else if (mimeWordEncoding === 'B') {
        encodedStr = typeof data === 'string' ? data : base64.encode(data);
        maxLength = maxLength ? Math.max(3, ((maxLength - (maxLength % 4)) / 4) * 3) : 0;
    }

    if (maxLength && (mimeWordEncoding !== 'B' ? encodedStr : base64.encode(data)).length > maxLength) {
        if (mimeWordEncoding === 'Q') {
            encodedStr = splitMimeEncodedString(encodedStr, maxLength).join('?= =?' + toCharset + '?' + mimeWordEncoding + '?');
        } else {
            // RFC2047 6.3 (2) states that encoded-word must include an integral number of characters, so no chopping unicode sequences
            let parts = [];
            let lpart = '';
            for (let i = 0, len = encodedStr.length; i < len; i++) {
                let chr = encodedStr.charAt(i);
                // check if we can add this character to the existing string
                // without breaking byte length limit
                if (Buffer.byteLength(lpart + chr) <= maxLength || i === 0) {
                    lpart += chr;
                } else {
                    // we hit the length limit, so push the existing string and start over
                    parts.push(base64.encode(lpart));
                    lpart = chr;
                }
            }
            if (lpart) {
                parts.push(base64.encode(lpart));
            }

            if (parts.length > 1) {
                encodedStr = parts.join('?= =?' + toCharset + '?' + mimeWordEncoding + '?');
            } else {
                encodedStr = parts.join('');
            }
        }
    } else if (mimeWordEncoding === 'B') {
        encodedStr = base64.encode(data);
    }

    return '=?' + toCharset + '?' + mimeWordEncoding + '?' + encodedStr + (encodedStr.substr(-2) === '?=' ? '' : '?=');
}


// https://github.com/nodemailer/nodemailer/blob/3aca7be0919c6f17b2d18ba8420a6464c7c22be0/lib/mime-funcs/index.js#L545
const splitMimeEncodedString = (str, maxlen) => {
    let curLine,
        match,
        chr,
        done,
        lines = [];

    // require at least 12 symbols to fit possible 4 octet UTF-8 sequences
    maxlen = Math.max(maxlen || 0, 12);

    while (str.length) {
        curLine = str.substr(0, maxlen);

        // move incomplete escaped char back to main
        if ((match = curLine.match(/[=][0-9A-F]?$/i))) {
            curLine = curLine.substr(0, match.index);
        }

        done = false;
        while (!done) {
            done = true;
            // check if not middle of a unicode char sequence
            if ((match = str.substr(curLine.length).match(/^[=]([0-9A-F]{2})/i))) {
                chr = parseInt(match[1], 16);
                // invalid sequence, move one char back anc recheck
                if (chr < 0xc2 && chr > 0x7f) {
                    curLine = curLine.substr(0, curLine.length - 3);
                    done = false;
                }
            }
        }

        if (curLine.length) {
            lines.push(curLine);
        }
        str = str.substr(curLine.length);
    }

    return lines;
}


// https://github.com/nodemailer/nodemailer/blob/3aca7be0919c6f17b2d18ba8420a6464c7c22be0/lib/qp/index.js#L11
function qp_encode(buffer) {
    if (typeof buffer === 'string') {
        buffer = Buffer.from(buffer, 'utf-8');
    }

    // usable characters that do not need encoding
    let ranges = [
        // https://tools.ietf.org/html/rfc2045#section-6.7
        [0x09], // <TAB>
        [0x0a], // <LF>
        [0x0d], // <CR>
        [0x20, 0x3c], // <SP>!"#$%&'()*+,-./0123456789:;
        [0x3e, 0x7e] // >?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz{|}
    ];
    let result = '';
    let ord;

    for (let i = 0, len = buffer.length; i < len; i++) {
        ord = buffer[i];
        // if the char is in allowed range, then keep as is, unless it is a WS in the end of a line
        if (checkRanges(ord, ranges) && !((ord === 0x20 || ord === 0x09) && (i === len - 1 || buffer[i + 1] === 0x0a || buffer[i + 1] === 0x0d))) {
            result += String.fromCharCode(ord);
            continue;
        }
        result += '=' + (ord < 0x10 ? '0' : '') + ord.toString(16).toUpperCase();
    }

    return result;
}


// https://github.com/nodemailer/nodemailer/blob/3aca7be0919c6f17b2d18ba8420a6464c7c22be0/lib/qp/index.js#L132
function checkRanges(nr, ranges) {
    for (let i = ranges.length - 1; i >= 0; i--) {
        if (!ranges[i].length) {
            continue;
        }
        if (ranges[i].length === 1 && nr === ranges[i][0]) {
            return true;
        }
        if (ranges[i].length === 2 && nr >= ranges[i][0] && nr <= ranges[i][1]) {
            return true;
        }
    }
    return false;
}

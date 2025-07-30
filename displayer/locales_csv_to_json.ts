
import fs from 'node:fs'
import path from 'node:path'

import papaparse from 'papaparse'


// Update JSON locale files with data from CSV
// NOTE Adds to existing, so CSV can just contain any new strings, but must have all languages
function generate_json(){

    // Parse CSV
    const parsed = papaparse.parse(fs.readFileSync('locales.csv', 'utf8'), {
        skipEmptyLines: true,
    })
    const rows = parsed.data as string[][]

    // Remove header and identify supported languages
    const langs = rows.shift()!
    fs.writeFileSync('src/locales.json', JSON.stringify({
        // NOTE Exclude en as that is the default value when no translation
        supported: langs.slice(1),
    }))

    // Update file for each language
    // NOTE Skips first column of originals
    for (let col_index = 1; col_index < langs.length; col_index++){
        let translations = Object.fromEntries(rows.map(row => {
            return [row[0]!, row[col_index]!]
        }))
        const lang = langs[col_index]!
        const file_path = path.join('src/locales', `${lang}.json`)

        // Get existing data
        let existing:Record<string, string> = {}
        if (fs.existsSync(file_path)){
            existing = JSON.parse(fs.readFileSync(file_path, 'utf8')) as Record<string, string>
        }
        translations = {...existing, ...translations}

        // NOTE Indent so separate lines and easier to track changes (very small file anyway)
        fs.writeFileSync(file_path, JSON.stringify(translations, null, 4))
    }
}


// Execute
generate_json()


/* LOCATION OF STRINGS

# App
Click original link to view message

# AppFooter
Unsubscribe
Resubscribe
Change email address
Created with

# AppHistory
Previously opened

# AppMessage
Download interrupted (check your internet connection)
Message has expired
Could not read message (part of the link may be missing)
Unknown error
Request new copy
Retry

# AppUnsubscribed
Network issue detected
Invalid URL
This account is no longer active
You've unsubscribed
undo

# DialogChangeAddress
# DUPLICATE Change email address
This message was sent to
New email address
Cancel
Change

# DialogResend
Request new copy of message
# DUPLICATE Cancel
Send

# DialogSubscribe
Full name
Email address
Message
subscribed
Close
Subscribe

# DialogUnsub
# DUPLICATE Unsubscribe
Are you sure you'd like to unsubscribe?
# DUPLICATE Cancel

# MessageReply
Replied
Only author can see
Secure reply
All responses are securely encrypted and only visible to author

# SectionFiles
Click to save
Click to open
Download

# SectionRespond
Commented
# DUPLICATE Only author can see

# SharedRespondReact
React

# SharedRespondReply
Comment

*/

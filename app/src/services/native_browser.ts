// Utilities that either rely on native features or are extended by them


export async function test_email_settings(settings):Promise<string>{
    // Tests provided settings to see if they work and returns either null or error string
    return "Not supported by platform"
}


export async function send_emails(settings, emails, from, no_reply):Promise<string[]>{
    return emails.map(email => "Not supported by platform")
}

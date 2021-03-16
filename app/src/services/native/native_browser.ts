// Utilities that either rely on native features or are extended by them


export async function dns_mx(host){
    return []
}


export async function test_email_settings(settings){
    return {
        code: "NOT_SUPPORTED",
        message: "",
        response: "",
    }
}


export async function send_emails(settings, emails, from, no_reply){
    return emails.map(email => {
        return {
            code: "NOT_SUPPORTED",
            message: "",
            response: "",
        }
    })
}

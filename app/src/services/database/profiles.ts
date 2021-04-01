
import {
    AppDatabaseConnection, RecordProfile, RecordProfileHost, RecordProfileSmtp,
    RecordProfileOptions, MessageOptionsIdentity, MessageOptionsSecurity, RecordProfileHostState,
} from './types'
import {generate_token, generate_key_asym} from '@/services/utils/crypt'
import {buffer_to_url64} from '@/services/utils/coding'
import {HostUser} from '@/services/hosts/types'
import {HostUserAws} from '@/services/hosts/aws_user'
import {OAUTH_SUPPORTED} from '@/services/tasks/oauth'
import {email_address_like} from '../utils/misc'
import {partition} from '../utils/strings'


export interface SmtpProvider {
    host:string
    port:number
    starttls:boolean
    domains:string[]
    app_pass?:{
        url:string,
        url_two_step:string,
    }
    mx_base?:string
}


export const SMTP_PROVIDERS:{[provider:string]:SmtpProvider} = {
    google: {
        host: 'smtp.gmail.com',
        port: 465,
        starttls: false,
        domains: ['gmail.com', 'googlemail.com'],
        app_pass: {
            url: 'https://myaccount.google.com/apppasswords',
            url_two_step: 'https://myaccount.google.com/signinoptions/two-step-verification',
        },
        mx_base: 'google.com',
    },
    yahoo: {
        host: 'smtp.mail.yahoo.com',
        port: 465,
        starttls: false,
        domains: ['yahoo.com'],  // https://help.yahoo.com/kb/yahoo-dmarc-policy-sln24050.html
        app_pass: {
            url: 'https://login.yahoo.com/account/security/app-passwords/list',
            url_two_step: 'https://login.yahoo.com/account/security',
        },
    },
    microsoft: {
        // tslint:disable-next-line:max-line-length
        // https://support.microsoft.com/en-us/office/pop-and-imap-email-settings-for-outlook-8361e398-8af4-4e97-b147-6c6c4ac95353
        host: 'smtp.office365.com',
        port: 587,
        starttls: true,
        domains: ['hotmail.com', 'outlook.com', 'live.com'],
        app_pass: {
            url: 'https://account.live.com/proofs/Manage',
            url_two_step: 'https://account.live.com/proofs/Manage',
        },
    },
    apple: {
        host: 'smtp.mail.me.com',
        port: 587,
        starttls: true,
        domains: ['icloud.com'],
        app_pass: {
            url: 'https://appleid.apple.com/account/manage',
            url_two_step: 'https://appleid.apple.com/account/manage',
        },
    },
    psmail: {
        host: 'mail.psmail.net',
        port: 465,
        starttls: false,
        domains: ['psmail.net', 'psmx.org'],
        app_pass: {
            url: 'https://info.psmail.net/xsupport/device-password/',
            url_two_step: 'https://info.psmail.net/xsupport/software-token/',
        },
    },
}


export class Profile implements RecordProfile {

    id:string
    setup_step:number
    host:RecordProfileHost
    host_state:RecordProfileHostState
    email:string
    smtp:RecordProfileSmtp
    options:RecordProfileOptions
    msg_options_identity:MessageOptionsIdentity
    msg_options_security:MessageOptionsSecurity

    constructor(db_object:RecordProfile){
        Object.assign(this, db_object)
    }

    get setup_complete(){
        // Whether profile has been fully setup yet
        return this.setup_step === null
    }

    get display():string{
        // Return string for displaying profile (that will never be blank)
        return this.display_host
    }

    get display_host():string{
        // Return string for displaying host bucket/user
        if (!this.setup_complete)
            return "New Account"
        return this.host.user ?? this.host.bucket
    }

    get email_domain():string{
        // Extract domain part of email address (if any)
        if (email_address_like(this.email)){
            return partition(this.email, '@')[1]
        }
        return null
    }

    get smtp_detected():string{
        // Auto-detect provider based on domain name or host (if given)
        if (!this.email?.includes('@'))
            return null
        const domain = this.email.split('@').pop().toLowerCase()
        for (const [provider, config] of Object.entries(SMTP_PROVIDERS)){
            if (config.domains.includes(domain) || config.host === this.smtp.host){
                return provider
            }
        }
        return null
    }

    get smtp_detected_config():SmtpProvider{
        // Return defaults for smtp provider (if detected)
        return this.smtp_detected && SMTP_PROVIDERS[this.smtp_detected]
    }

    get smtp_settings():RecordProfileSmtp{
        // Return final smtp settings after accounting for defaults
        // NOTE Address and password are always provided directly by user
        const settings = Object.assign({}, this.smtp)
        settings.host ||= `smtp.${this.email_domain}`
        settings.port ||= 465
        settings.user ||= this.email
        if (this.smtp_detected){
            settings.host = this.smtp_detected_config.host
            settings.port = this.smtp_detected_config.port
            settings.starttls = this.smtp_detected_config.starttls
        }
        return settings
    }

    get smtp_oauth_supported():boolean{
        // Whether oauth is supported for detected provider (and should therefore be used)
        return !!this.smtp_detected && this.smtp_detected in OAUTH_SUPPORTED
    }

    get smtp_ready():boolean{
        // Whether settings have been fully configured yet or not
        return !!this.smtp.oauth || !!this.smtp.pass
    }

    get configs_need_uploading(){
        // Return whether configs need uploading (and able to do so)
        return this.setup_complete && (
            !this.host_state.displayer_config_uploaded || !this.host_state.responder_config_uploaded
        )
    }

    view_url(copy_id:string, secret:ArrayBuffer, action?:string){
        // Return URL for viewing the given copy
        let domain:string
        if (this.host.cloud === 'aws'){
            // NOTE Not using website mode since actually makes URL longer
            // NOTE Including region as faster than being redirected from generic subdomain
            domain = `${this.host.bucket}.s3-${this.host.region}.amazonaws.com`
        }
        const secret64 = buffer_to_url64(secret)
        let url = `https://${domain}/_#${this.host_state.disp_config_name},${copy_id},${secret64}`
        if (action){
            url += `,${action}`
        }
        return url
    }

    new_host_user():HostUser{
        // Return new instance of correct host class with profile's host settings
        if (this.host.cloud === 'aws'){
            return new HostUserAws(this.host)
        } else {
            throw Error("Invalid cloud platform")
        }
    }
}


export class DatabaseProfiles {

    _conn:AppDatabaseConnection

    constructor(connection:AppDatabaseConnection){
        this._conn = connection
    }

    async list():Promise<Profile[]>{
        // Get all profiles
        return (await this._conn.getAll('profiles')).map(profile => new Profile(profile))
    }

    async get(id:string):Promise<Profile>{
        // Get single profile by id
        const profile = await this._conn.get('profiles', id)
        return profile && new Profile(profile)
    }

    async set(profile:RecordProfile):Promise<void>{
        // Insert or update profile
        await this._conn.put('profiles', profile)
    }

    async create():Promise<Profile>{
        // Create a new profile
        // NOTE Defaults are for 'very_high' security category
        const profile = new Profile({
            id: generate_token(),
            setup_step: 1,
            host: {
                cloud: null,
                bucket: null,
                region: null,
                user: null,
                credentials: null,
                credentials_responder: null,
            },
            host_state: {
                disp_config_name: generate_token(),
                resp_key: await generate_key_asym(),
                displayer_config_uploaded: false,
                responder_config_uploaded: false,
            },
            email: '',
            smtp: {
                oauth: null,
                user: '',
                pass: '',
                host: '',
                port: null,
                starttls: false,
            },
            options: {
                notify_mode: 'replies',
                notify_include_contents: false,
                allow_replies: true,
                allow_reactions: true,
                allow_delete: true,
                allow_resend_requests: true,
                auto_exclude_threshold: null,
                auto_exclude_exempt_groups: [],
                smtp_no_reply: true,
                social_referral_ban: true,
            },
            msg_options_identity: {
                sender_name: '',
                // WARN Keep templates the same as user will expect them to be (may not change them)
                invite_tmpl_email: `
                    <p>Dear CONTACT,</p>
                    <p>Please see below for latest news.</p>
                    <p>Regards,<br>SENDER</p>
                `,
                invite_tmpl_clipboard: 'Dear CONTACT, please see below for latest news. Regards, SENDER\n\nSUBJECT\nLINK',
            },
            msg_options_security: {
                lifespan: 3,
                max_reads: 1,
            },
        })
        await this._conn.add('profiles', profile)

        return profile
    }

    async remove(id:string):Promise<void>{
        // Remove the profile and remove it from drafts

        // Start transaction and get stores
        const transaction = this._conn.transaction(['profiles', 'drafts'], 'readwrite')
        const store_profiles = transaction.objectStore('profiles')
        const store_drafts = transaction.objectStore('drafts')

        // Remove the actual profile
        store_profiles.delete(id)

        // Remove the profile from drafts
        for (const draft of await store_drafts.getAll()){
            if (draft.profile === id){
                draft.profile = null
                store_drafts.put(draft)
            }
        }

        // Task done when transaction completes
        await transaction.done
    }
}


import {AppDatabaseConnection, RecordProfile, RecordProfileHost, RecordProfileSmtp,
    RecordProfileOptions, RecordProfileHostState} from './types'
import {generate_token, generate_key_asym, generate_key_sym} from '@/services/utils/crypt'
import {buffer_to_url64} from '@/services/utils/coding'
import {HostUser} from '@/services/hosts/types'
import {OAUTH_SUPPORTED} from '@/services/tasks/oauth'
import {email_address_like} from '../utils/misc'
import {partition} from '../utils/strings'
import {get_host_user} from '../hosts/hosts'
import {request_blob} from '../utils/http'


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
        mx_base: 'outlook.com',
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

    id!:string
    setup_step!:number|null
    host!:RecordProfileHost
    host_state!:RecordProfileHostState
    email!:string
    smtp!:RecordProfileSmtp
    options!:RecordProfileOptions
    msg_options_identity!:{
        sender_name:string
        invite_image:Blob
        invite_tmpl_email:string
        invite_tmpl_clipboard:string
    }
    msg_options_security!:{
        lifespan:number
        max_reads:number
    }

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
        return this.host.user ?? this.host.bucket!
    }

    get email_domain():string|null{
        // Extract domain part of email address (if any)
        if (email_address_like(this.email)){
            return partition(this.email, '@')[1]
        }
        return null
    }

    get smtp_detected():string|null{
        // Auto-detect provider based on domain name or host (if given)
        if (!this.email?.includes('@'))
            return null
        const domain = this.email.split('@').pop()!.toLowerCase()
        for (const [provider, config] of Object.entries(SMTP_PROVIDERS)){
            if (config.domains.includes(domain) || config.host === this.smtp.host){
                return provider
            }
        }
        return null
    }

    get smtp_detected_config():SmtpProvider|null{
        // Return defaults for smtp provider (if detected)
        return (this.smtp_detected && SMTP_PROVIDERS[this.smtp_detected]) || null
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

    get smtp_reply_to_name():string{
        // The "name" to be used for Reply-To contact if smtp_no_reply enabled
        return "PLEASE DON'T REPLY VIA EMAIL (open message to reply)"
    }

    get smtp_reply_to():{name:string, address:string}|undefined{
        // Return name/address contact pair for use with Reply-To header

        // If allowing email replies, or in-message replies not enabled, no need for a Reply-To
        if (!this.options.smtp_no_reply || !this.options.allow_replies){
            return undefined
        }

        /* SECURITY Not using a noreply address as it doesn't improve security
            Main aim is to avoid replier keeping a copy of their own reply
            Even if a dead address is used, the replier would still end up with a saved draft
            Gmail also doesn't allow localhost addresses, so that's not an option anyway
            So best thing to do is to warn the replier before they start typing
                and otherwise still allow replies (as easy to get around anyway)
        */
        return {
            name: this.smtp_reply_to_name,
            address: this.email,
        }
    }

    get configs_need_uploading(){
        // Return whether configs need uploading (and able to do so)
        return this.setup_complete && (
            !this.host_state.displayer_config_uploaded || !this.host_state.responder_config_uploaded
        )
    }

    view_url(copy_id:string, secret:ArrayBuffer, action?:string){
        // Return URL for viewing the given copy
        let domain!:string
        if (this.host.cloud === 'aws'){
            // NOTE Not using website mode since actually makes URL longer
            // NOTE Including region as faster than being redirected from generic subdomain
            domain = `${this.host.bucket!}.s3-${this.host.region!}.amazonaws.com`
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
        const host_user_class = get_host_user(this.host.cloud)
        return new host_user_class(this.host.credentials, this.host.bucket, this.host.region,
            this.host.user)
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

    async get(id:string):Promise<Profile|undefined>{
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
        const default_invite_image = await request_blob('default_invite_image.jpg')
        const profile = new Profile({
            id: generate_token(),
            setup_step: 0,
            host: {
                cloud: null,
                bucket: null,
                region: null,
                user: null,
                credentials: null,
            },
            host_state: {
                secret: await generate_key_sym(false, ['encrypt', 'decrypt']),
                resp_key: await generate_key_asym(),
                disp_config_name: generate_token(),
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
                reaction_options: ['like', 'love', 'yay', 'pray', 'laugh', 'wow', 'sad'],
                reply_invite_image: default_invite_image,
                reply_invite_tmpl_email: `
                    <p>Hi <span data-mention data-id='contact_hello'></span>,</p>
                    <p><span data-mention data-id='sender_name'></span> has replied to you.</p>
                `,
            },
            msg_options_identity: {
                sender_name: '',
                invite_image: default_invite_image,
                invite_tmpl_email: `
                    <p>Hi <span data-mention data-id='contact_hello'></span>,</p>
                    <p>Please see below for latest news.</p>
                    <p>Regards,<br><span data-mention data-id='sender_name'></span></p>
                `,
                invite_tmpl_clipboard: ""
                    + "Hi CONTACT, please see below for latest news. Regards, SENDER"
                    + "\n\nSUBJECT\nLINK",
            },
            msg_options_security: {
                lifespan: 7,
                max_reads: 3,
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
        void store_profiles.delete(id)

        // Remove the profile from drafts
        for (const draft of await store_drafts.getAll()){
            if (draft.profile === id){
                draft.profile = null
                void store_drafts.put(draft)
            }
        }

        // Task done when transaction completes
        await transaction.done
    }
}

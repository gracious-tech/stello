
import {cloneDeep} from 'lodash'

import {AppDatabaseConnection, RecordProfile, RecordProfileHost, RecordProfileSmtp,
    RecordProfileOptions, RecordProfileHostState} from './types'
import {generate_token, generate_key_asym, generate_key_sym} from '@/services/utils/crypt'
import {buffer_to_url64} from '@/services/utils/coding'
import {OAUTH_SUPPORTED} from '@/services/tasks/oauth'
import {email_address_like} from '../utils/misc'
import {partition} from '../utils/strings'
import {HOST_STORAGE_VERSION} from '@/services/hosts/common'
import {external_decrypt} from '@/services/misc/external_crypt'


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
        host: 'partner-mx.psmail.net',
        port: 465,
        starttls: false,
        domains: ['psmail.net', 'psmx.org', 'psmx.asia', 'fastzip.net', 'realcoolmail.com'],
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
        invite_button:string
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
        if (this.host?.cloud === 'gracious' && this.host.username){
            return this.host.username
        } else if (this.host?.cloud === 'aws' && this.host.bucket){
            return this.host.bucket
        }
        return "New Account"
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

    get smtp_settings(){
        // Return final smtp settings after accounting for defaults
        // WARN Does not include password as it requires async decryption
        const oauth = this.smtp.oauth  // Used when creating transport id (not actually smtp)
        let host = this.smtp.host || (this.email_domain ? `smtp.${this.email_domain}` : '')
        let port = this.smtp.port || 465
        let starttls = this.smtp.starttls
        const user = this.smtp.user || this.email
        if (this.smtp_detected_config){
            host = this.smtp_detected_config.host
            port = this.smtp_detected_config.port
            starttls = this.smtp_detected_config.starttls
        }
        return {oauth, host, port, starttls, user, pass: ''}
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
        return "PLEASE DON'T REPLY VIA EMAIL"
    }

    get smtp_reply_to():{name:string, address:string}|undefined{
        // Return name/address contact pair for use with Reply-To header

        // If allowing email replies then no need for a Reply-To
        if (!this.options.smtp_no_reply){
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

    get host_accessible(){
        // Whether host is accessible (have credentials for it)
        return this.host && (this.host.cloud === 'aws' || this.host.federated_id)
    }

    get host_needs_update(){
        // Whether host services need updating before can send again
        if (!this.setup_complete){
            return false
        }
        if (this.host!.cloud === 'gracious'){
            return false
        }
        return this.host_state.version !== HOST_STORAGE_VERSION
    }

    get max_lifespan():number{
        // Get max lifespan for messages (gracious has 2 year limit)
        return this.host?.cloud === 'gracious' ? 365 * 2 : Infinity
    }

    get api():string{
        // Get URL for api
        if (!this.host)
            throw new Error('impossible')
        return this.host.cloud === 'gracious' ? import.meta.env.VITE_HOSTED_API :
            `https://${this.host.generated.api_id!}.execute-api.${this.host.region}.amazonaws.com/`
    }

    get user():string{
        // Get host user
        if (!this.host)
            throw new Error('impossible')
        return this.host.cloud === 'gracious' ? this.host.username : '_user'
    }

    get view_domain():string{
        // The domain messages will be viewed at
        if (this.host?.cloud === 'gracious'){
            const user = this.host.username
            const parent = this.options.generic_domain
                ? import.meta.env.VITE_HOSTED_DOMAIN_UNBRANDED
                : import.meta.env.VITE_HOSTED_DOMAIN_BRANDED
            return `${user}.${parent}`
        } else if (this.host?.cloud === 'aws'){
            // NOTE Not using website mode since actually makes URL longer
            // NOTE Including region as faster than being redirected from generic subdomain
            return `${this.host.bucket}.s3-${this.host.region}.amazonaws.com`
        }
        throw new Error('impossible')
    }

    get view_displayer():string{
        // The url for the displayer
        const path = this.host?.cloud === 'gracious' ? '/' : '/_'
        return `https://${this.view_domain}${path}`
    }

    async get_authed_smtp_settings(){
        // Get smtp_settings with password included
        return {
            ...this.smtp_settings,
            pass: this.smtp.pass ? await external_decrypt(this.smtp.pass) : '',
        }
    }

    view_url(config_secret64:string, copy_id:string, secret:ArrayBuffer, action?:string){
        // Return URL for viewing the given copy
        const secret64 = buffer_to_url64(secret)
        action = action ? `,${action}` : ''
        return `${this.view_displayer}#${config_secret64},${copy_id},${secret64}${action}`
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

    async create_object():Promise<Profile>{
        // Create a new profile object
        // NOTE Defaults are for 'very_high' security category
        const default_invite_image = new Blob(
            [await self.app_native.read_file('default_invite_image.jpg')], {type: 'image/jpeg'})
        return new Profile({
            id: generate_token(),
            setup_step: 0,
            host: null,
            host_state: {
                version: null,
                secret: await generate_key_sym(false, ['encrypt', 'decrypt']),
                // SECURITY short key as only for configs and better to keep URL short if possible
                shared_secret: await generate_key_sym(true, ['encrypt'], true),
                resp_key: await generate_key_asym(),
                displayer_config_uploaded: false,
                responder_config_uploaded: false,
            },
            email: '',
            smtp: {
                oauth: null,
                user: '',
                pass: null,
                host: '',
                port: null,
                starttls: false,
            },
            options: {
                send_to_self: 'yes_without_replies_email',
                notify_mode: 'replies',
                notify_include_contents: false,
                allow_replies: true,
                allow_comments: true,
                allow_reactions: true,
                allow_delete: true,
                allow_resend_requests: true,
                auto_exclude_threshold: null,
                auto_exclude_exempt_groups: [],
                smtp_no_reply: true,
                social_referral_ban: true,
                generic_domain: true,
                reaction_options: ['like', 'love', 'yay', 'pray', 'laugh', 'wow', 'sad'],
                reply_invite_image: default_invite_image,
                reply_invite_tmpl_email: `
                    <p>Hi <span data-mention data-id='contact_hello'></span>,</p>
                    <p><span data-mention data-id='sender_name'></span> has replied to you.</p>
                `,
                reply_invite_button: "Open Reply",
                theme_style: 'modern',
                theme_color: this.get_default_theme_color(),
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
                invite_button: "Open Message",
            },
            msg_options_security: {
                lifespan: 7,
                max_reads: 3,
            },
        })
    }

    async create():Promise<Profile>{
        // Create a new profile (and save to db)
        const profile = await this.create_object()
        await this._conn.add('profiles', profile)
        return profile
    }

    async copy(original:Profile):Promise<Profile>{
        // Create a new profile from an existing one (without host settings)

        // Generate new profile
        const copy = await this.create_object()

        // Only copy fields known to be safe to copy (exclude host settings especially)
        copy.email = original.email
        copy.smtp = cloneDeep(original.smtp)
        copy.options = cloneDeep(original.options)
        copy.msg_options_identity = cloneDeep(original.msg_options_identity)
        copy.msg_options_security = cloneDeep(original.msg_options_security)

        // Save the copy to the database and return
        await this.set(copy)
        return copy
    }

    async remove(id:string):Promise<void>{
        // Remove the profile and remove related records

        // Start transaction and get stores
        const transaction = this._conn.transaction(
            ['profiles', 'drafts', 'unsubscribes', 'subscribe_forms'], 'readwrite')
        const store_profiles = transaction.objectStore('profiles')
        const store_drafts = transaction.objectStore('drafts')
        const store_unsubs = transaction.objectStore('unsubscribes')
        const store_forms = transaction.objectStore('subscribe_forms')

        // Remove the actual profile
        void store_profiles.delete(id)

        // Remove the profile from drafts
        for (const draft of await store_drafts.getAll()){
            if (draft.profile === id){
                draft.profile = null
                void store_drafts.put(draft)
            }
        }

        // Remove related unsubscribes
        // NOTE Previously didn't do this until v1.5.0
        for (const unsub of await store_unsubs.index('by_profile').getAll(id)){
            void store_unsubs.delete([id, unsub.contact])
        }

        // Remove related subscribe_forms
        for (const form of await store_forms.getAll()){
            if (form.profile === id){
                void store_forms.delete(form.id)
            }
        }

        // Task done when transaction completes
        await transaction.done
    }

    get_default_theme_color(){
        // Return default theme color object (a method so always new object)
        return {h: 210, s: 0.75, l: 0.75}
    }
}

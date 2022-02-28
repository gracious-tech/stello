
import {HostStorageGeneratedAws} from '../../services/hosts/aws_common'
import {IDBPDatabase, DBSchema, IDBPTransaction, StoreNames} from 'idb'


// State

export interface RecordState {
    key:string
    value:unknown
}


// Contact

export interface RecordContact {
    id:string
    created:Date
    name:string
    name_hello:string
    address:string  // An email address (previously planned to allow links, but never implemented)
    notes:string
    service_account:string|null  // issuer:issuer_id
    service_id:string|null  // The id for this contact in the service account
    multiple:boolean  // Whether the contact represents multiple people rather than an individual
}


// Group

export interface RecordGroup {
    id:string
    name:string
    contacts:string[]
    service_account:string|null  // issuer:issuer_id
    service_id:string|null
}


// OAuth

export interface RecordOAuth {
    id:string  // Random internal id
    issuer:'google'|'microsoft'
    issuer_id:string  // The issuer's id for the user
    issuer_config:Record<string, unknown>
    email:string
    name:string|null  // May be null if not required
    scope_sets:('email_send'|'contacts')[]
    token_refresh:ArrayBuffer  // Externally encrypted
    token_access:ArrayBuffer  // Externally encrypted
    token_access_expires:Date|null  // When access token will expire (null = doesn't expire)
    // Contact syncing
    contacts_sync:boolean  // Whether to read contacts of this account if possible
    contacts_sync_last:Date
    contacts_sync_token:string  // Token representing last sync so can do partials
}


// Profile

export interface RecordProfile {
    id:string
    setup_step:number|null  // null if setup complete
    host:RecordProfileHost
    host_state:RecordProfileHostState
    email:string  // Address used for both sending and receiving notifications
    smtp:RecordProfileSmtp
    options:RecordProfileOptions
    msg_options_identity:{  // Defaults
        sender_name:string
        invite_image:Blob
        invite_tmpl_email:string
        invite_tmpl_clipboard:string
    }
    msg_options_security:{  // Defaults
        lifespan:number  // NOTE may be Infinity
        max_reads:number  // NOTE may be Infinity
    }
}

export type RecordProfileHost = RecordProfileHostAws|RecordProfileHostGracious|null

export interface RecordProfileHostAws {
    cloud:'aws'
    bucket:string
    region:string
    generated:HostStorageGeneratedAws
}

export interface RecordProfileHostGracious {
    cloud:'gracious'
    plan:'c'|'other'
    username:string
    password:string
    federated_id:string
    id_token:string
    id_token_exires:number  // Since epoch (ms)
}

export interface RecordProfileHostState {
    version:number|null  // Host storage version currently deployed (null for gracious)
    secret:CryptoKey  // Private to user; used to send and get back data without revealing contents
    shared_secret:CryptoKey  // Private to user & readers; for protecting non-message data
    resp_key:CryptoKeyPair  // Private to user; used to receive data without interception
    displayer_config_uploaded:boolean  // False when it needs updating
    responder_config_uploaded:boolean  // False when it needs updating
}

export interface RecordProfileSmtp {
    oauth:string|null
    user:string
    pass:ArrayBuffer|null  // Externally encrypted
    host:string
    port:number|null
    starttls:boolean
}

export interface RecordProfileOptions {
    notify_mode:'none'|'first_new_reply'|'replies'|'replies_and_reactions'
    notify_include_contents:boolean  // Only applicable to replies & replies_and_reactions
    allow_replies:boolean
    allow_reactions:boolean
    allow_delete:boolean
    allow_resend_requests:boolean
    auto_exclude_threshold:number|null
    auto_exclude_exempt_groups:string[]
    smtp_no_reply:boolean
    social_referral_ban:boolean
    generic_domain:boolean
    reaction_options:('like'|'love'|'yay'|'pray'|'laugh'|'wow'|'sad')[]
    reply_invite_image:Blob  // Used for inheritance for replies instead of invite_image
    reply_invite_tmpl_email:string  // Used for inheritance for replies instead of invite_tmpl_email
}


// Draft

export type SectionIds = ([string]|[string, string])[]

export interface RecordDraft {
    id:string
    template:boolean
    reply_to:string|null
    modified:Date
    title:string
    sections:SectionIds
    profile:string|null
    options_identity:{
        sender_name:string  // No null as empty string triggers inheritance
        invite_image:Blob|null
        invite_tmpl_email:string|null
        invite_tmpl_clipboard:null  // TODO remove, not used
    }
    options_security:{
        lifespan:number|null  // NOTE may be Infinity (null used for inheritance)
        max_reads:number|null  // NOTE may be Infinity (null used for inheritance)
    }
    recipients:RecordDraftRecipients
}

export interface RecordDraftRecipients {
    include_groups:string[]  // 'all' is a special case that is to include all contacts
    include_contacts:string[]
    exclude_groups:string[]
    exclude_contacts:string[]
}


// Section

export interface RecordSection<TContent extends RecordSectionContent=RecordSectionContent> {
    id:string
    respondable:boolean|null  // null for auto decide
    content:TContent
}

export type RecordSectionContent =
    ContentText|ContentImages|ContentVideo|ContentPage  // ContentFile

export interface ContentText {
    type:'text'
    html:string
    standout:null|'subtle'|'distinct'|'notice'|'important'
}

export interface ContentImages {
    type:'images'
    images:ContentImageItem[]
    crop:boolean
}

export interface ContentImageItem {
    id:string
    data:Blob
    caption:string  // Writers with blind recipients can use captions instead of alt text too
}

export interface ContentPage {
    type:'page'
    headline:string
    desc:string
    image:Blob|null
    sections:SectionIds
}

export interface ContentVideo {
    type:'video'
    format:'iframe_youtube'|'iframe_vimeo'|null
    id:string|null
    caption:string
    start:number|null
    end:number|null
}

export interface ContentFile {
    type:'file'
    data:Blob
    filename:string
    download:boolean  // Whether to force download or allow preview in browser (if supported)
}


// Message

export interface RecordDraftPublished extends RecordDraft {
    profile:string  // Cannot be null
    template:false
}

export interface RecordMessage {
    id:string
    published:Date
    expired:boolean  // True if all copies and assets gone from server, false if unknown
    draft:RecordDraftPublished  // Entire object preserved to make "edit as new" easier
    assets_key:CryptoKey
    assets_uploaded:{[id:string]:boolean}  // Key exists = uploaded, and boolean whether latest
    // Must preserve expiration values as determined when message first published
    //      Otherwise profile's values might change, and if inherited, true values no longer known
    lifespan:number
    max_reads:number
}


// Message copy

export interface RecordMessageCopy {
    id:string
    msg_id:string
    secret:CryptoKey
    secret_sse:CryptoKey  // Separate secret for any server-side encryption (i.e. exposed to server)
    resp_token:string  // A secret passed back in responses to confirm authenticity
    uploaded:boolean
    uploaded_latest:boolean
    invited:boolean|null  // Null if haven't attempted yet, false if error sending
    expired:boolean  // True if server copy definitely gone, false if unknown
    contact_id:string
    // Preserve contact details in case contact object later deleted
    contact_name:string
    contact_hello:string  // The final result hello (not raw value hello)
    contact_address:string
    contact_multiple:boolean
}


// Responses

export interface RecordResponseCore {
    // All responses have these basics for debugging and analysing threats
    sent:Date
    ip:string|null  // May be null if record created locally (e.g. unsubscribes)
    user_agent:string|null  // May be null if record created locally (e.g. unsubscribes)
}

export interface RecordResponseCommon extends RecordResponseCore {
    // Properties present in common responses like reads/reactions/replies
    id:string
    copy_id:string|null
    msg_id:string|null  // So don't have to retrieve copy every time want to know msg_id
}

export interface RecordRead extends RecordResponseCommon {}

export interface RecordReplaction extends RecordResponseCommon {
    msg_title:string|null  // In case message object later deleted
    contact_id:string|null  // So don't have to retrieve copy every time want to know contact
    contact_name:string|null  // So can still know contact name even if contact object deleted
    section_id:string|null  // May be null if a general reply to whole message
    subsection_id:string|null  // Some section types have subsections (e.g. image in slideshow)
    content:string
    read:boolean
    replied:boolean
    archived:boolean
}

export interface RecordReaction extends RecordReplaction {}

export interface RecordReply extends RecordReplaction {}

export interface RecordUnsubscribe extends RecordResponseCore {
    profile:string  // id[0]
    contact:string  // id[1]
}

export interface RecordRequestAddress extends RecordResponseCore {
    contact:string  // id
    old_address:string
    new_address:string
}

export interface RecordRequestResend extends RecordResponseCore {
    contact:string  // id[0]
    message:string  // id[1]
    reason:string
}


// Database

export type AppDatabaseConnection = IDBPDatabase<AppDatabaseSchema>

export interface AppDatabaseSchema extends DBSchema {
    state:{
        key:string,  // The type of whatever key is used (in this case it's value.key)
        value:RecordState,
    }
    contacts:{
        key:string,
        value:RecordContact,
        indexes:{
            by_service_account:string,
            by_address:string,
        },
    }
    groups:{
        key:string,
        value:RecordGroup,
        indexes:{
            by_service_account:string,
        },
    }
    oauths:{
        key:string,
        value:RecordOAuth,
        indexes:{
            by_issuer_id:[string, string],
        },
    }
    profiles:{
        key:string,
        value:RecordProfile,
    }
    unsubscribes:{
        key:[string, string],
        value:RecordUnsubscribe,
        indexes:{
            by_profile:string,
            by_contact:string,
        },
    }
    request_address:{
        key:string,
        value:RecordRequestAddress,
    }
    request_resend:{
        key:[string, string],
        value:RecordRequestResend,
    }
    drafts:{
        key:string,
        value:RecordDraft,
    }
    sections:{
        key:string,
        value:RecordSection,
    }
    messages:{
        key:string,
        value:RecordMessage,
    }
    copies:{
        key:string,
        value:RecordMessageCopy,
        indexes:{
            by_msg:string,
            by_contact:string,
            by_resp_token:string,
        },
    }
    reads:{
        key:string,
        value:RecordRead,
        indexes:{
            by_msg:string,
        },
    }
    replies:{
        key:string,
        value:RecordReply,
        indexes:{
            by_msg:string,
            by_contact:string,
        },
    }
    reactions:{
        key:string,
        value:RecordReaction,
        indexes:{
            by_msg:string,
            by_contact:string,
        },
    }
}

export type VersionChangeTransaction = IDBPTransaction<
    AppDatabaseSchema,
    StoreNames<AppDatabaseSchema>[],
    'versionchange'
>

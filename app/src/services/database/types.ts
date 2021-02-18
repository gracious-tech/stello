
import {IDBPDatabase, DBSchema} from 'idb'


// State

export interface RecordState {
    key:string
    value:any
}


// Contact

export interface RecordContact {
    id:string
    created:Date
    name:string
    name_hello:string
    address:string
    notes:string
}


// Group

export interface RecordGroup {
    id:string
    name:string
    contacts:string[]
}


// Profile

export interface RecordProfile {
    id:string
    setup_step:number
    host:RecordProfileHost
    host_state:RecordProfileHostState
    email:string  // Address used for both sending and receiving notifications
    smtp:RecordProfileSmtp
    options:RecordProfileOptions
    msg_options_identity:MessageOptionsIdentity  // Defaults
    msg_options_security:MessageOptionsSecurity  // Defaults
}

export interface RecordProfileHost {
    cloud:string  // aws, google, etc
    bucket:string
    region:string
    user:string  // Absence of user indicates self-hosted (one user per bucket)
    credentials:HostCredentialsAws  // May be a JSON string for Google Cloud
    credentials_responder:HostCredentialsAws  // May not be needed for Google Cloud
}

export interface RecordProfileHostState {
    disp_config_name:string
    resp_key:CryptoKeyPair
    displayer_config_uploaded:boolean  // False when it needs updating
    responder_config_uploaded:boolean  // False when it needs updating
}

export interface HostCredentialsAws {
    key_id:string
    key_secret:string
}

export interface RecordProfileSmtp {
    user:string
    pass:string
    host:string
    port:number
    starttls:boolean
}

export interface RecordProfileOptions {
    notify_mode:string  // none, first_new_reply, replies, replies_and_reactions
    notify_include_contents:boolean  // Only applicable to replies & replies_and_reactions
    allow_replies:boolean
    allow_reactions:boolean
    allow_delete:boolean
    allow_resend_requests:boolean
    auto_exclude_threshold:number
    auto_exclude_exempt_groups:string[]
    smtp_no_reply:boolean
    social_referral_ban:boolean
}


// Draft

export interface RecordDraft {
    id:string
    template:boolean
    reply_to:string
    modified:Date
    title:string
    sections:string[][]
    profile:string
    options_identity:MessageOptionsIdentity
    options_security:MessageOptionsSecurity
    recipients:RecordDraftRecipients
}

export interface RecordDraftRecipients {
    include_groups:string[]
    include_contacts:string[]
    exclude_groups:string[]
    exclude_contacts:string[]
}


// Section

export interface RecordSection<TContent extends RecordSectionContent=RecordSectionContent> {
    id:string
    content:TContent
}

export type RecordSectionContent =
    ContentText|ContentImages|ContentArticle|ContentVideo|ContentFile

export interface ContentText {
    type:'text'
    html:string
    standout:string
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

export interface ContentArticle {
    type:'article'
    title:string
    subtitle:string
    image:Blob
    sections:string[]  // All except articles allowed
}

export interface ContentVideo {
    type:'video'
    format:'iframe_youtube'|'iframe_vimeo'
    id:string
    start:number
    end:number
}

export interface ContentFile {
    type:'file'
    data:Blob
    filename:string
    download:boolean  // Whether to force download or allow preview in browser (if supported)
}


// Message

export interface RecordMessage {
    id:string
    published:Date
    draft:RecordDraft  // Entire object preserved for records and to make "edit as new" easier
    assets_key:CryptoKey
    assets_uploaded:{[id:string]:boolean}  // Key exists = uploaded, and boolean whether latest
}


// Message copy

export interface RecordMessageCopy {
    id:string
    msg_id:string
    secret:CryptoKey
    resp_token:string  // A secret passed back in responses to confirm authenticity
    uploaded:boolean
    uploaded_latest:boolean
    invited:boolean
    contact_id:string
    // Preserve contact details in case contact object later deleted
    contact_name:string
    contact_hello:string  // The final result hello (not raw value hello)
    contact_address:string
}


// Responses

export interface RecordResponse {
    id:string
    sent:Date
    ip:string
    user_agent:string
    copy_id:string
    msg_id:string  // So don't have to retrieve copy every time want to know msg_id
}

export interface RecordRead extends RecordResponse {
}

export interface RecordReplaction extends RecordResponse {
    msg_title:string  // In case message object later deleted
    contact_id:string  // So don't have to retrieve copy every time want to know contact
    contact_name:string  // So can still know contact name even if contact object deleted
    section_id:string  // May be null if a general reply to whole message
    section_num:number  // So can at least know order of sections if later delete them
    section_type:string  // So can at least know the type of section if later deleted
    content:string
    read:boolean
}

export interface RecordReaction extends RecordReplaction {
}

export interface RecordReply extends RecordReplaction {
    replied:boolean
    archived:boolean
}


// Generic

export interface MessageOptionsIdentity {
    sender_name:string
    invite_tmpl_email:string
    invite_tmpl_clipboard:string
}

export interface MessageOptionsSecurity {
    lifespan:number  // NOTE may be Infinite (null used for inheritance)
    max_reads:number  // NOTE may be Infinite (null used for inheritance)
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
    }
    groups:{
        key:string,
        value:RecordGroup,
    }
    profiles:{
        key:string,
        value:RecordProfile,
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


// PUBLISHED

export interface PublishedCopyBase {
    title:string
    published:string
    base_msg_id:string  // Needed for working out where assets are
    sections:PublishedSections
    assets_key:string
}

export interface PublishedCopy extends PublishedCopyBase {
    has_max_reads:boolean
    permission_subscription:boolean
    contact_address:string
}

export type PublishedSections = ([PublishedSection]|[PublishedSection, PublishedSection])[]

export interface PublishedSection<TContent extends PublishedSectionContent=PublishedSectionContent>{
    id:string  // Required to match reactions with appropriate sections (in case order edited later)
    respondable:boolean  // Unlike in db, this cannot be null
    content:TContent
}

export type PublishedSectionContent =
    PublishedContentText|PublishedContentImages|PublishedContentVideo|PublishedContentPage

export interface PublishedContentText {
    type:'text'
    html:string
    standout:string|null
}

export interface PublishedContentImages {
    type:'images'
    images:PublishedImage[]
    ratio_width:number
    ratio_height:number
    hero?:boolean  // Not optional, just didn't exist until after v1.0.11
}

export interface PublishedContentVideo {
    type:'video'
    format:'iframe_youtube'|'iframe_vimeo'
    id:string
    caption:string
    start:number|null
    end:number|null
}

export interface PublishedContentPage {
    type:'page'
    button:boolean
    headline:string
    desc:string
    image:string|null
    sections:PublishedSections
}

export interface PublishedImage {
    id:string
    caption:string
}

export interface PublishedAsset {
    id:string
    data:ArrayBuffer
}


// RESPONSES

export interface ResponseData {
    event:ResponseEvent
    ip:string|null  // May not be available for some setups
}

export type ResponseEvent = ResponseEventRead|ResponseEventReplaction|ResponseEventSubscription
    |ResponseEventAddress|ResponseEventResend

export interface ResponseEventRead {
    user_agent:string
    resp_token:string
    copy_id:string  // Only for responder's use
    has_max_reads:boolean  // Only for responder's use
}

export interface ResponseEventReplaction {
    user_agent:string
    resp_token:string
    content:string|null  // Reaction can be null to clear any previous
    section_id:string|null
    subsection_id:string|null
}

export interface ResponseEventSubscription {
    user_agent:string
    resp_token:string
    subscribed:boolean
    sym_encrypted?: {
        address:string,
    }
}

export interface ResponseEventAddress {
    user_agent:string
    resp_token:string
    new_address:string
    sym_encrypted?: {
        address:string,  // The old address
    }
}

export interface ResponseEventResend {
    user_agent:string
    resp_token:string
    content:string
}


// CONFIG

export type ThemeStyle = 'modern'|'formal'|'beautiful'|'fun'
export type ThemeColor = {h:number, s:number, l:number}

export interface DisplayerConfig {
    version:string
    responder:string
    notify_include_contents:boolean
    allow_replies:boolean
    allow_comments:boolean
    allow_reactions:boolean
    allow_delete:boolean
    allow_resend_requests:boolean
    social_referral_ban:boolean
    resp_key_public:string
    reaction_options:string[]
    theme_style:ThemeStyle
    theme_color:ThemeColor
}


// TYPE UTILS

declare global {
    type MinOne<T> = [T, ...T[]]
}


// PUBLISHED

export interface PublishedCopyBase {
    title:string
    published:string
    base_msg_id:string  // Needed for working out where assets are
    sections:PublishedSection[][]
    assets_key:string
}

export interface PublishedCopy extends PublishedCopyBase {
    has_max_reads:boolean
    permission_subscription:boolean
    contact_address:string
}

export interface PublishedSection<TContent extends PublishedSectionContent=PublishedSectionContent>{
    id:string  // Required to match reactions with appropriate sections (in case order edited later)
    respondable:boolean  // Unlike in db, this cannot be null
    content:TContent
}

export type PublishedSectionContent =
    PublishedContentText|PublishedContentImages|PublishedContentVideo

export interface PublishedContentText {
    type:'text'
    html:string
    standout:string
}

export interface PublishedContentImages {
    type:'images'
    images:PublishedImage[]
    ratio_width:number
    ratio_height:number
}

export interface PublishedContentVideo {
    type:'video'
    format:'iframe_youtube'|'iframe_vimeo'
    id:string
    caption:string
    start:number
    end:number
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

export type ResponseType = ResponseEvent['type']

export interface ResponseEventRead {
    type:'read'
    user_agent:string
    resp_token:string
    copy_id:string  // Only for responder's use
    has_max_reads:boolean  // Only for responder's use
}

export interface ResponseEventReplaction {
    type:'reply'|'reaction'
    user_agent:string
    resp_token:string
    content:string|null  // Reaction can be null to clear any previous
    section_id:string|null
    subsection_id:string|null
}

export interface ResponseEventSubscription {
    type:'subscription'
    user_agent:string
    resp_token:string
    subscribed:boolean
    sym_encrypted?: {
        address:string,
    }
}

export interface ResponseEventAddress {
    type:'address'
    user_agent:string
    resp_token:string
    new_address:string
    sym_encrypted?: {
        address:string,  // The old address
    }
}

export interface ResponseEventResend {
    type:'resend'
    user_agent:string
    resp_token:string
    content:string
}


// OTHER


export interface DeploymentConfig {
    url_msgs:string
    url_msgs_append_subdomain:boolean
    url_responder:string
}

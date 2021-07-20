
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
    format:string
    id:string
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
    error:string|null
}

export type ResponseEvent = ResponseEventRead|ResponseEventReplaction

export interface ResponseEventRead {
    type:'read'
    resp_token:string
    user_agent:string
    copy_id:string  // Only for responder's use
    has_max_reads:boolean  // Only for responder's use
}

export interface ResponseEventReplaction {
    type:'reply'|'reaction'
    resp_token:string
    user_agent:string
    content:string|null  // Reaction can be null to clear any previous
    section_id:string|null
    subsection_id:string|null
}


// OTHER


export interface DeploymentConfig {
    url_msgs:string
    url_msgs_append_subdomain:boolean
    url_responder:string
}

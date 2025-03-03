
import {Component} from 'vue'
import {Route} from 'vue-router'

import {RecordSection} from '@/services/database/types'
import {MessageCopy} from '@/services/database/copies'


export interface AppStoreState {

    // Configurable
    dark:boolean
    dark_message:boolean
    default_profile:string|null
    default_template:string|null
    default_contacts:string|null
    manager_aws_key_id:string
    manager_aws_max_lifespan:number  // Added after 0.8.3
    fallback_secret:CryptoKey|null  // Added after 1.4.9

    // Private state
    usage_installed:Date|null
    usage_opens:number
    usage_sends:number
    show_splash_welcome:boolean
    show_splash_disclaimer:boolean
    show_guide_default:boolean

    // Tmp
    tmp:{

        // Viewport dimensions (excluding scrollbars)
        viewport_width:number,
        viewport_height:number,

        // User UI
        snackbar:{msg:string, btn_label?:string, btn_color?:string, btn_handler?:()=>void}|null,
        dialog:StateTmpDialog|null,
        prev_route:Route|null,
        prev_state_contacts:{filter_group_id:string, search:string, scroll_top:number}|null,
        cut_section:RecordSection[]|null,  // First section is one that was cut, others subsections
        closing:boolean|'force'

        // Unread responses
        // NOTE Using objects with `true` constant for performance and reactivity
        unread_replies:Record<string, true>,
        unread_reactions:Record<string, true>,

        // Copy property changes (for watching)
        uploaded:MessageCopy|null,
        invited:MessageCopy|null,

        // Secrets that shouldn't be preserved
        manager_aws_key_secret:string,
    }
}

export interface StateTmpDialog {
    component:Component
    props?:Record<string, unknown>
    persistent?:boolean
    wide?:boolean
    tall?:boolean
    resolve?:(v?:unknown)=>void  // Added by show_dialog action
}

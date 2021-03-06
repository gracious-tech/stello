
import {Task} from '@/services/tasks'
import {Location} from 'vue-router'


export interface AppStoreState {

    // Configurable
    dark:boolean
    dark_message:boolean
    default_profile:string
    default_template:string
    manager_aws_key_id:string
    manager_aws_key_secret:string

    // Private state
    usage_installed:Date
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
        snackbar:boolean,
        snackbar_text:string,
        dialog:StateTmpDialog,
        prev_location:Location,

        // Tasks
        tasks:Task[],
        checking_responses:boolean,
    }
}

export interface StateTmpDialog {
    component:object
    props:object
    persistent:boolean
}

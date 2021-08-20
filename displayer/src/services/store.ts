
import {reactive, readonly, DeepReadonly, Component, markRaw} from 'vue'

// @ts-ignore For some reason TS imports below fine but says it can't when checking types
import DialogChangeAddress from '../components/DialogChangeAddress.vue'
import {database} from './database'
import {MessageRecord} from './database_assets'
import {displayer_config} from './displayer_config'
import {decode_hash} from './hash'
import {respond_subscription} from './responses'
import {remove_value} from './utils/arrays'
import {buffer_to_url64} from './utils/coding'
import {export_key, generate_hash} from './utils/crypt'
import {check_webp_support} from './webp'


// TYPES

export interface StoreStateDict {
    dark:boolean
    last_read:string|null
    prev_config_name:string|null
    unsubscribed:string[]  // Array of response tokens
}

export interface StoreState {
    dict:StoreStateDict
    history:MessageRecord[]
    current_msg:MessageAccess|null
    webp_supported:boolean
    transition:'none'|'prev'|'next'
    dialog:null|{component:Component, props:Record<string, any>}
}

export interface MessageAccess {
    id:string
    secret:CryptoKey
    resp_token:string
    title:string|null  // Only provided when viewing old messages
    published:Date|null  // Only provided when viewing old messages
}


// STORE

export class DisplayerStore {

    _state!:StoreState
    state!:DeepReadonly<StoreState>  // Public read-only version

    get unsubscribed():boolean{
        // Whether have unsubscribed from the current message
        // NOTE Better would be to track by profile+contact, but that info not available if expired
        if (!this.state.current_msg){
            return false
        }
        return this.state.dict.unsubscribed.includes(this.state.current_msg.resp_token)
    }

    async init():Promise<void>{
        // Make store ready for use

        // Get color scheme preference
        // NOTE Will be false if query not supported, making 'light' effectively the default
        const os_dark = matchMedia('(prefers-color-scheme: dark)').matches

        // Init state as a reactive object
        this._state = reactive({
            dict: {
                dark: os_dark,
                last_read: null,
                prev_config_name: null,
                unsubscribed: [],
                ...await database.dict_get_all(),  // Override defaults with any saved values
            },
            history: await database.message_get_all(),
            current_msg: null,
            webp_supported: await check_webp_support(),
            transition: 'none',  // Non-matching on first load
            dialog: null,
        })

        // Create public read-only access to state
        this.state = readonly(this._state)

        // Process current hash and listen for changes
        // NOTE Important if user opens a message and browser reuses an already open tab
        await this.process_hash()
        self.addEventListener('hashchange', async event => {
            // Don't trigger when hash has been cleared by previous `process_hash` call
            // Also don't process if just reacting to a failure restoring the hash to the url
            if (self.location.hash !== '' && (!self._failed || self.location.hash !== self._hash)){
                this.process_hash()
            }
        })

        // If no hash and .'. no current message, load last read
        if (!this.state.current_msg){
            const record = this._state.history.find(item => {
                return item.id === this._state.dict.last_read
            })
            if (record){
                this.change_current_msg(record.id, record.secret, record.title, record.published)
            }
        }
    }

    async process_hash():Promise<void>{
        // Decode hash and, if valid, change to that msg and save its details
        // NOTE On first load the index JS will have put the hash in a custom variable

        // Decode the hash
        const hash = await decode_hash(self.location.hash || self._hash)

        // Ensure hash cleared for security
        // NOTE Never clear if in failed state, so user can copy to different browser if needed
        // NOTE Failed state here possible if doing initial process, and not a 'hashchange' event
        if (self.location.hash && !self._failed){
            self.location.hash = ''
        }

        // Update displayer config (do for every hash in case changed)
        const name_that_worked = await displayer_config.load(hash?.disp_config_name,
            this._state.dict.prev_config_name)
        if (name_that_worked && name_that_worked === hash?.disp_config_name){
            this._state.dict.prev_config_name = hash.disp_config_name
            database.dict_set('prev_config_name', hash.disp_config_name)
        }

        // Load msg if valid
        if (hash){
            await this.change_current_msg(hash.msg_id, hash.msg_secret, null, null)

            // Handle action if any
            if (hash.action === 'unsub'){
                this.update_subscribed(false, hash.action_arg)
            } else if (hash.action === 'address'){
                this.dialog_open(DialogChangeAddress, {encrypted_address: hash.action_arg})
            }
        }
    }

    async change_current_msg(id:string, secret:CryptoKey, title:string|null, published:Date|null)
            :Promise<void>{
        // Change the current message and generate resp_token for it
        this._state.current_msg = {
            id,
            secret,
            title,
            published,
            resp_token: buffer_to_url64(await generate_hash(await export_key(secret))),
        }
        // Reset page title when changing message
        self.document.title = title || "Message Viewer"
    }

    async save_message_meta(message:MessageRecord):Promise<void>{
        // Save the metadata for a message that has been successfully decrypted
        await database.message_set(message)
        this._state.history = await database.message_get_all()
        await database.dict_set('last_read', message.id)
    }

    toggle_dark():void{
        // Toggle dark mode
        this._state.dict.dark = !this._state.dict.dark
        database.dict_set('dark', this._state.dict.dark)
    }

    change_transition(transition:'prev'|'next'):void{
        // Change the direction of transition animation
        this._state.transition = transition
    }

    dialog_open(component:Component, props:Record<string, any>={}):void{
        // Open a dialog with the given contents
        // NOTE markRaw prevents making already-reactive component reactive
        this._state.dialog = {component: markRaw(component), props}
    }

    dialog_close():void{
        // Close current dialog
        this._state.dialog = null
    }

    async update_subscribed(subscribed:boolean, encrypted_address:string|null=null):Promise<void>{
        // Update whether subscribed, and send response

        // Update fresh copy of unsubscribed array from db
        const resp_token = this._state.current_msg!.resp_token
        const unsubscribed:string[] = await database.dict_get('unsubscribed') as string[] ?? []
        if (subscribed){
            remove_value(unsubscribed, resp_token)
        } else if (!unsubscribed.includes(resp_token)){
            unsubscribed.push(resp_token)
        }

        // Save to db and store
        database.dict_set('unsubscribed', unsubscribed)
        this._state.dict.unsubscribed = unsubscribed

        // Send response
        respond_subscription(resp_token, subscribed, encrypted_address)
    }
}


export const store = new DisplayerStore()

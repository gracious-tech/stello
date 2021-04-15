
import {reactive, readonly, DeepReadonly} from 'vue'

import {database, MessageRecord} from './database'
import {displayer_config} from './displayer_config'
import {decode_hash} from './hash'
import {check_webp_support} from './webp'


// TYPES

export interface StoreStateDict {
    dark:boolean
    last_read:MessageAccess|null
    prev_config_name:string|null
}

export interface StoreState {
    dict:StoreStateDict
    current_msg:MessageAccess|null
    show_unsubscribe:boolean
    webp_supported:boolean
}

export interface MessageAccess {
    id:string
    secret:CryptoKey
}


// STORE

export class DisplayerStore {

    _state!:StoreState
    state!:DeepReadonly<StoreState>  // Public read-only version

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
                ...await database.dict_get_all(),  // Override defaults with any saved values
            },
            current_msg: null,
            show_unsubscribe: false,
            webp_supported: await check_webp_support(),
        })

        // Create public read-only access to state
        this.state = readonly(this._state)

        // Process current hash and listen for changes
        // NOTE Important if user opens a message and browser reuses an already open tab
        await this.process_hash()
        self.addEventListener('hashchange', async event => {
            // Don't trigger when hash has been cleared by previous `process_hash` call
            if (self.location.hash !== ''){
                this.process_hash()
            }
        })

        // If no hash and .'. no current message, load last read
        if (!this._state.current_msg){
            this._state.current_msg = this._state.dict.last_read
        }
    }

    async process_hash():Promise<void>{
        // Decode hash and, if valid, change to that msg and save its details
        // NOTE On first load the index JS will have put the hash in a custom variable

        // Decode the hash
        const hash = await decode_hash(self.location.hash || self._hash)

        // Update displayer config (do for every hash in case changed)
        const name_that_worked = await displayer_config.load(hash?.disp_config_name,
            this._state.dict.prev_config_name)
        if (name_that_worked && name_that_worked === hash?.disp_config_name){
            this._state.dict.prev_config_name = hash.disp_config_name
            database.dict_set('prev_config_name', hash.disp_config_name)
        }

        // Save and change msg if valid
        if (hash){
            this._state.current_msg = {id: hash.msg_id, secret: hash.msg_secret}

            if (hash.action === 'unsub'){
                this._state.show_unsubscribe = true
            }
        }

        // Ensure hash cleared for security
        self.location.hash = ''
    }

    save_message_meta(message:MessageRecord):void{
        // Save the metadata for a message that has been successfully decrypted
        database.message_set(message)
        database.dict_set('last_read', {
            id: message.id,
            secret: message.secret,
        })
    }

    toggle_dark():void{
        // Toggle dark mode
        this._state.dict.dark = !this._state.dict.dark
        database.dict_set('dark', this._state.dict.dark)
    }
}


export const store = new DisplayerStore()

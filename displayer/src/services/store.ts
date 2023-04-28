
import {reactive, readonly, DeepReadonly, Component, markRaw} from 'vue'

// @ts-ignore For some reason TS imports below fine but says it can't when checking types
import DialogChangeAddress from '../components/DialogChangeAddress.vue'
import DialogSubscribe from '../components/DialogSubscribe.vue'
import {database} from './database'
import {MessageRecord} from './database_assets'
import {MSGS_URL, USER} from './env'
import {displayer_config} from './displayer_config'
import {decode_hash} from './hash'
import {respond_subscription, respond_read} from './responses'
import {remove_value} from './utils/arrays'
import {buffer_to_url64, url64_to_buffer, utf8_to_string} from './utils/coding'
import {generate_hash, decrypt_sym, import_key_sym} from './utils/crypt'
import {check_webp_support} from './webp'
import {request, report_http_failure} from './utils/http'
import {PublishedContentPage, PublishedCopy, PublishedSection} from '@/shared/shared_types'
import {get_form_data} from '@/services/subscribe_forms'


// TYPES

export interface StoreStateDict {
    dark:boolean
    last_read:string|null
    config_secret:string|null
    unsubscribed:string[]  // Array of response tokens
}

export interface StoreState {
    dict:StoreStateDict
    history:MessageRecord[]
    msg:MessageAccess|null
    webp_supported:boolean
    transition:'none'|'prev'|'next'
    dialog:null|{component:Component, props:Record<string, unknown>, persistent:boolean}
}

export interface MessageAccess {
    id:string
    secret_url64:string
    title:string|null  // Only provided when viewing old messages
    published:Date|null  // Only provided when viewing old messages
    resp_token:string
    data:PublishedCopy|null
    data_error:null|'network'|'expired'|'corrupted'
    page:PublishedSection<PublishedContentPage>|null
    assets_key:CryptoKey|null
    assets_cache:Record<string, ArrayBuffer>
}


// STORE

export class DisplayerStore {

    _state!:StoreState
    state!:DeepReadonly<StoreState>  // Public read-only version

    get unsubscribed():boolean{
        // Whether have unsubscribed from the current message
        // NOTE Better would be to track by profile+contact, but that info not available if expired
        if (!this.state.msg){
            return false
        }
        return this.state.dict.unsubscribed.includes(this.state.msg.resp_token)
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
                config_secret: null,
                unsubscribed: [],
                ...await database.dict_get_all(),  // Override defaults with any saved values
            },
            history: await database.message_get_all(),
            msg: null,
            webp_supported: await check_webp_support(),
            transition: 'none',  // Non-matching on first load
            dialog: null,
        })

        // Create public read-only access to state
        this.state = readonly(this._state)

        // Process current hash and listen for changes
        // NOTE Important if user opens a message and browser reuses an already open tab
        await this.process_hash()
        self.addEventListener('hashchange', event => {
            // Don't trigger when hash has been cleared by previous `process_hash` call
            // Also don't process if just reacting to a failure restoring the hash to the url
            if (self.location.hash !== ''
                    && (!self.app_failed || self.location.hash !== self.app_hash)){
                void this.process_hash()
            }
        })

        // If no hash and .'. no current message, load last read
        if (!this.state.msg){
            const record = this._state.history.find(item => {
                return item.id === this._state.dict.last_read
            })
            if (record){
                void this.change_msg(record.id, record.secret_url64, record.title,
                    record.published)
            }
        }
    }

    async process_hash():Promise<void>{
        // Decode hash and, if valid, change to that msg and save its details
        // NOTE On first load the index JS will have put the hash in a custom variable

        // Decode the hash
        const hash = await decode_hash(self.location.hash || self.app_hash)

        // Ensure hash cleared for security
        // NOTE Never clear if in failed state, so user can copy to different browser if needed
        // NOTE Failed state here possible if doing initial process, and not a 'hashchange' event
        if (self.location.hash && !self.app_failed){
            self.location.hash = ''
        }

        // If a form id, try and decrypt the data
        if (hash?.subscribe){
            const subscribe_form = await get_form_data(hash.subscribe)
            if (subscribe_form){
                // Show dialog
                this.dialog_open(DialogSubscribe, {form: subscribe_form}, true)
                // Get the config secret from the form's data
                hash.config_secret_url64 = subscribe_form.config_secret_url64
            }
        }

        // Update displayer config (do for every hash in case changed)
        if (this._state.dict.config_secret){
            await displayer_config.safe_load(this._state.dict.config_secret)
        } else if (hash?.config_secret_url64){
            if (await displayer_config.safe_load(hash.config_secret_url64)){
                // Config loaded successfully with the hash's config secret
                this._state.dict.config_secret = hash.config_secret_url64
                void database.dict_set('config_secret', hash.config_secret_url64)
            }
        }

        // Load msg if valid
        if (hash?.msg_id && hash.msg_secret_url64){
            await this.change_msg(hash.msg_id, hash.msg_secret_url64, null, null)

            // Handle action if any, and account not disabled
            if (displayer_config.responder){
                if (hash.action === 'unsub'){
                    void this.update_subscribed(false, hash.action_arg)
                } else if (hash.action === 'address'){
                    this.dialog_open(DialogChangeAddress, {encrypted_address: hash.action_arg})
                }
            }
        }
    }

    async change_msg(id:string, secret_url64:string, title:string|null,
            published:Date|null):Promise<void>{
        // Change the current message and generate resp_token for it

        // Generate resp_token
        let resp_token = ''
        try {
            resp_token = buffer_to_url64(await generate_hash(url64_to_buffer(secret_url64), 0))
        } catch {
            // secret_url64 is probably not valid base64
            // Do nothing and let error handling of secret_url64 deal with it in `get_msg_data()`
        }

        this._state.msg = {
            id,
            secret_url64,
            title,
            published,
            resp_token,
            data: null,
            data_error: null,
            page: null,
            assets_key: null,
            assets_cache: {},
        }
        // Reset page title when changing message
        self.document.title = title || "Message Viewer"
        // Init first download attempt of message data
        void this.get_msg_data()
    }

    async get_msg_data(){
        // Attempt to download and decrypt the current message's data

        // Get own ref to msg object so that if msg id changes while downloading, won't affect new
        const msg = this._state.msg!

        // Reset error value
        msg.data_error = null

        // Try download the message
        const url = `${MSGS_URL}messages/${USER}/copies/${msg.id}`
        let encrypted:ArrayBuffer|null
        try {
            encrypted = await request(url, {}, 'arrayBuffer', 'throw_null403-4')
        } catch (thrown_error) {
            msg.data_error = 'network'
            report_http_failure(thrown_error)
            return
        }
        // NOTE Vite dev server serves index.html instead of 404 for missing files
        if (!encrypted ||
                (import.meta.env.DEV && utf8_to_string(encrypted.slice(0, 5)) === '<!DOC')){
            msg.data_error = 'expired'
            return
        }

        // Try to decrypt the message
        let decrypted:ArrayBuffer
        try {
            const secret = await import_key_sym(url64_to_buffer(msg.secret_url64))
            decrypted = await decrypt_sym(encrypted, secret)
        } catch {
            msg.data_error = 'corrupted'
            return
        }

        // Parse the data
        msg.data = JSON.parse(utf8_to_string(decrypted)) as PublishedCopy

        // Reformat old data structures (v0.1.1 and below)
        if (!Array.isArray(msg.data.sections[0])){
            // @ts-ignore old format
            msg.data.sections = msg.data.sections.map(section => [section])
        }

        // Report that message has been read/opened
        if (displayer_config.responder){
            void respond_read(msg.resp_token, msg.id, msg.data.has_max_reads)
        }

        // Update the page title
        self.document.title = msg.data.title

        // Save the metadata in db
        void store.save_message_meta({
            id: msg.id,
            secret_url64: msg.secret_url64,
            title: msg.data.title,
            published: new Date(msg.data.published),
        })
    }

    async get_asset(asset_id:string):Promise<ArrayBuffer|null>{
        // Download and decrypt an asset's data

        // Get own ref to msg object so that if msg id changes while downloading, won't affect new
        const msg = this._state.msg!

        // Ensure assets key has been imported already
        if (!msg.assets_key){
            msg.assets_key = await import_key_sym(url64_to_buffer(msg.data!.assets_key))
        }

        // Get from cache if already downloaded
        if (asset_id in msg.assets_cache){
            return msg.assets_cache[asset_id]!
        }

        // Fetch
        const url = `${MSGS_URL}messages/${USER}/assets/${msg.data!.base_msg_id}/${asset_id}`
        let encrypted:ArrayBuffer|null = null
        try {
            encrypted = await request(url, {}, 'arrayBuffer', 'throw_null403-4')
        } catch (error){
            // Either network issue or server fault, either way, callers to show placeholder
            report_http_failure(error)
        }

        // Cache and return
        if (encrypted){
            msg.assets_cache[asset_id] = await decrypt_sym(encrypted, msg.assets_key)
        }
        return msg.assets_cache[asset_id] ?? null
    }

    change_page(page:PublishedSection<PublishedContentPage>|null){
        // Change the page currently being viewed
        this._state.msg!.page = page
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
        void database.dict_set('dark', this._state.dict.dark)
    }

    change_transition(transition:'prev'|'next'):void{
        // Change the direction of transition animation
        this._state.transition = transition
    }

    dialog_open(component:Component, props:Record<string, unknown>={}, persistent=false):void{
        // Open a dialog with the given contents
        // NOTE markRaw prevents making already-reactive component reactive
        this._state.dialog = {component: markRaw(component), props, persistent}
    }

    dialog_close():void{
        // Close current dialog
        this._state.dialog = null
    }

    async update_subscribed(subscribed:boolean, encrypted_address:string|null=null):Promise<void>{
        // Update whether subscribed, and send response

        // Update fresh copy of unsubscribed array from db
        const resp_token = this._state.msg!.resp_token
        const unsubscribed:string[] = await database.dict_get('unsubscribed') as string[] ?? []
        if (subscribed){
            remove_value(unsubscribed, resp_token)
        } else if (!unsubscribed.includes(resp_token)){
            unsubscribed.push(resp_token)
        }

        // Save to db and store
        await database.dict_set('unsubscribed', unsubscribed)
        this._state.dict.unsubscribed = unsubscribed

        // Send response
        await respond_subscription(resp_token, subscribed, encrypted_address)
    }
}


export const store = new DisplayerStore()


<template lang='pug'>

div
    AppUnsubscribed

    MessageContents(v-if='msg' :msg='msg')

    div.no_msg(v-else class='ui')

        h1 {{ current_msg.title }}
        p.date {{ current_msg.published?.toLocaleString() }}

        template(v-if='error')
            h2.error {{ error_desc }}
            button(v-if='fix_desc' @click='fix' class='btn-text s-primary') {{ fix_desc }}
        AppProgress(v-else)

    AppHistory

    AppFooter(:msg='msg')

</template>


<script lang='ts'>

import {ref, provide, defineComponent} from 'vue'

import AppFooter from './AppFooter.vue'
import AppHistory from './AppHistory.vue'
import AppUnsubscribed from './AppUnsubscribed.vue'
import DialogResend from './DialogResend.vue'
import MessageContents from './MessageContents.vue'
import {decrypt_sym, import_key_sym} from '../services/utils/crypt'
import {request, report_http_failure} from '../services/utils/http'
import {utf8_to_string, url64_to_buffer} from '../services/utils/coding'
import {store} from '../services/store'
import {PublishedCopy} from '../shared/shared_types'
import {respond_read} from '../services/responses'
import {displayer_config, MSGS_URL, USER} from '../services/displayer_config'
import {GetAsset} from '@/services/types'


export default defineComponent({

    components: {MessageContents, AppHistory, AppFooter, AppUnsubscribed},

    setup(){

        // State
        const current_msg = store.state.current_msg!
        const msg = ref<PublishedCopy>()
        const error = ref<'network'|'expired'|'corrupted'|null>(null)
        const error_desc = ref<string|null>(null)
        const fix_desc = ref<string|null>(null)
        const get_asset = ref<GetAsset>()

        // Access to secret that ignores fact is readonly due to store (stop TS complaining)
        const secret = current_msg.secret as CryptoKey

        // Provides
        provide('get_asset', get_asset)

        // Method for downloading and decrypting the message
        const get_message = async () => {

            // Reset error value
            error.value = null

            // Try download the message
            const url = `${MSGS_URL}messages/${USER}/copies/${current_msg.id}`
            let encrypted:ArrayBuffer|null
            try {
                encrypted = await request(url, {}, 'arrayBuffer', 'throw_null403-4')
            } catch (thrown_error) {
                error.value = 'network'
                error_desc.value = "Download interrupted (check your internet connection)"
                fix_desc.value = "Retry"
                report_http_failure(thrown_error)
                return
            }
            // NOTE Vite dev server serves index.html instead of 404 for missing files
            if (!encrypted ||
                    (import.meta.env.DEV && utf8_to_string(encrypted.slice(0, 5)) === '<!DOC')){
                error.value = 'expired'
                error_desc.value = "Message has expired"
                fix_desc.value = displayer_config.allow_resend_requests ? "Request new copy" : null
                return
            }

            // Try to decrypt the message
            let decrypted:ArrayBuffer
            try {
                decrypted = await decrypt_sym(encrypted, secret)
            } catch {
                error.value = 'corrupted'
                error_desc.value = "Could not read message (part of the link may be missing)"
                fix_desc.value = "Retry"
                return
            }

            // Parse the data
            const msg_data = JSON.parse(utf8_to_string(decrypted)) as PublishedCopy

            // Reformat old data structures (v0.1.1 and below)
            if (!Array.isArray(msg_data.sections[0])){
                // @ts-ignore old format
                msg_data.sections = msg_data.sections.map(section => [section])
            }

            // Import the assets key and make a method for downloading and decrypting assets
            const assets_key = await import_key_sym(url64_to_buffer(msg_data.assets_key))
            get_asset.value = async (asset_id:string):Promise<ArrayBuffer|null> => {
                const url =
                    `${MSGS_URL}messages/${USER}/assets/${msg_data.base_msg_id}/${asset_id}`
                let encrypted:ArrayBuffer|null = null
                try {
                    encrypted = await request(url, {}, 'arrayBuffer', 'throw_null403-4')
                } catch (error){
                    // Either network issue or server fault, either way, callers to show placeholder
                    report_http_failure(error)
                }
                return encrypted ? decrypt_sym(encrypted, assets_key) : null
            }

            // Expose the message data
            // WARN Do not do this before exposing `get_asset()` as msg will be displayed too early
            msg.value = msg_data

            // Report that message has been read/opened
            void respond_read(current_msg.resp_token, current_msg.id, msg_data.has_max_reads)

            // Update the page title
            self.document.title = msg_data.title

            // Save the metadata in db
            void store.save_message_meta({
                id: current_msg.id,
                secret: secret,
                title: msg.value.title,
                published: new Date(msg.value.published),
            })
        }

        // Method for resolving errors
        const fix = () => {
            if (error.value === 'expired'){
                store.dialog_open(DialogResend)
            } else {
                void get_message()
            }
        }

        // Fetch the message now and decrypt it
        void get_message()

        return {
            msg,
            error,
            error_desc,
            fix,
            fix_desc,
            current_msg,
        }
    },
})

</script>


<style lang='sass' scoped>

@import '../shared/shared_mixins'

.no_msg
    margin-top: 100px
    text-align: center

    h1
        margin-bottom: 0

    .date
        margin-bottom: 36px

    .loading
        margin-bottom: 44px

    .error
        margin-bottom: 36px
        @include stello_themed(color, #b70, #f90)

</style>

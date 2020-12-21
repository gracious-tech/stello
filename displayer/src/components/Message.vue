
<template lang='pug'>

MessageContents(v-if='msg' :msg='msg' :get_asset='get_asset')

div.no_msg(v-else)
    div(v-if='error')
        p {{ error }}
        button(@click='get_message') Retry
    div(v-else) Loading...

</template>


<script lang='ts'>

import {ref, provide} from 'vue'

import MessageContents from './MessageContents.vue'
import {decrypt_sym, export_key, generate_hash} from '../services/utils/crypt'
import {request_buffer} from '../services/utils/http'
import {buffer_to_url64, buffer_to_utf8, url64_to_buffer} from '../services/utils/coding'
import {store, MessageAccess} from '../services/store'
import {PublishedCopy} from '../shared/shared_types'
import {import_key_sym} from '../services/utils/crypt'
import {deployment_config} from '../services/deployment_config'
import {respond_read} from '../services/responses'


export default {


components: {MessageContents},

props: {
    msg_access: {
        type: Object,
    },
},

setup(props:{msg_access:MessageAccess}, context){

    // State
    const msg = ref<PublishedCopy>(null)
    const error = ref(null)
    const get_asset = ref(null)
    const resp_token = ref(null)

    // Provides
    provide('resp_token', resp_token)

    // Method for downloading and decrypting the message
    const get_message = async () => {

        // Try download the message
        const url = `${deployment_config.url_msgs}copies/${props.msg_access.id}`
        let encrypted:ArrayBuffer
        try {
            encrypted = await request_buffer(url, {}, true)
        } catch {
            error.value = "Download interrupted (check your internet connection)"
            return
        }
        if (!encrypted){
            error.value = "Message not found (it probably expired)"
            return
        }

        // Try to decrypt the message
        let decrypted
        try {
            decrypted = await decrypt_sym(encrypted, props.msg_access.secret)
        } catch {
            error.value = "Could not read message (part of the link may be missing)"
            return
        }

        // Parse the data
        const msg_data = JSON.parse(buffer_to_utf8(decrypted)) as PublishedCopy

        // Generate response token
        resp_token.value =
            buffer_to_url64(await generate_hash(await export_key(props.msg_access.secret)))

        // Import the assets key and make a method for downloading and decrypting assets
        const assets_key = await import_key_sym(url64_to_buffer(msg_data.assets_key))
        get_asset.value = async (asset_id:string):Promise<ArrayBuffer> => {
            const url = `${deployment_config.url_msgs}assets/${msg_data.base_msg_id}/${asset_id}`
            const encrypted = await request_buffer(url, {}, true)
            return decrypt_sym(encrypted, assets_key)
        }

        // Expose the message data
        // WARN Do not do this before exposing `get_asset()` as message will be displayed too early
        msg.value = msg_data

        // Consider read if message contents displayed for x seconds
        // TODO Add delay and account for changing message, component update, etc
        respond_read(resp_token.value, props.msg_access.id, msg_data.has_max_reads)

        // Update the page title
        self.document.title = msg_data.title

        // Save the metadata in db
        store.save_message_meta({
            id: props.msg_access.id,
            secret: props.msg_access.secret,
            title: msg.value.title,
            published: msg.value.published,
        })
    }

    // Fetch the message now and decrypt it
    get_message()

    return {
        msg,
        error,
        get_message,
        get_asset,
    }
},


}

</script>


<style lang='sass' scoped>

.no_msg
    margin-top: 100px
    text-align: center

</style>

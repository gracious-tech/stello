
<template lang='pug'>

MessageContents(v-if='msg' :msg='msg')

div.no_msg(v-else)
    div(v-if='error')
        p {{ error }}
        button(@click='get_message' class='btn-text') Retry
    Progress(v-else)

</template>


<script lang='ts'>

import {ref, provide, PropType} from 'vue'

import Progress from './Progress.vue'
import MessageContents from './MessageContents.vue'
import {decrypt_sym, export_key, generate_hash} from '../services/utils/crypt'
import {request_buffer} from '../services/utils/http'
import {buffer_to_url64, utf8_to_string, url64_to_buffer} from '../services/utils/coding'
import {store, MessageAccess} from '../services/store'
import {PublishedCopy} from '../shared/shared_types'
import {import_key_sym} from '../services/utils/crypt'
import {deployment_config} from '../services/deployment_config'
import {respond_read} from '../services/responses'


export default {


components: {MessageContents, Progress},

props: {
    msg_access: {
        type: Object as PropType<MessageAccess>,
        required: true,
    },
},

setup(props, context){

    // State
    const msg = ref<PublishedCopy>()
    const error = ref<string|null>(null)
    const get_asset = ref<(asset_id:string) => Promise<ArrayBuffer>>()
    const resp_token = ref<string>()

    // Provides
    provide('msg_id', props.msg_access.id)
    provide('resp_token', resp_token)
    provide('get_asset', get_asset)

    // Method for downloading and decrypting the message
    const get_message = async () => {

        // Try download the message
        const url = `${deployment_config.url_msgs}copies/${props.msg_access.id}`
        let encrypted:ArrayBuffer|null
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
        let decrypted:ArrayBuffer
        try {
            decrypted = await decrypt_sym(encrypted, props.msg_access.secret)
        } catch {
            error.value = "Could not read message (part of the link may be missing)"
            return
        }

        // Parse the data
        const msg_data = JSON.parse(utf8_to_string(decrypted)) as PublishedCopy

        // Reformat old data structures (v0.1.1 and below)
        if (!Array.isArray(msg_data.sections[0])){
            // @ts-ignore old format
            msg_data.sections = msg_data.sections.map(section => [section])
        }

        // Generate response token
        resp_token.value =
            buffer_to_url64(await generate_hash(await export_key(props.msg_access.secret)))

        // Import the assets key and make a method for downloading and decrypting assets
        const assets_key = await import_key_sym(url64_to_buffer(msg_data.assets_key))
        get_asset.value = async (asset_id:string):Promise<ArrayBuffer> => {
            const url = `${deployment_config.url_msgs}assets/${msg_data.base_msg_id}/${asset_id}`
            const encrypted = await request_buffer(url, {}, true)
            return decrypt_sym(encrypted!, assets_key)
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
    }
},


}

</script>


<style lang='sass' scoped>

.no_msg
    margin-top: 100px
    text-align: center

</style>

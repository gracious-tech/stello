
<template lang='pug'>

v-card
    v-card-title Use existing storage

    v-card-text
        p If you've been provided with storage credentials you can copy and paste them in here.
        app-security-alert Only use credentials from a source you trust

        p(class='text-center')
            app-btn(@click='paste') Paste storage credentials

        p(class='text-center error--text mt-4') {{ error }}

    v-card-actions
        app-btn(@click='dismiss') Close

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {get_clipboard_text} from '@/services/utils/misc'
import {decrypt_sym, import_key_sym} from '@/services/utils/crypt'
import {utf8_to_string, url64_to_buffer} from '@/services/utils/coding'
import {Profile} from '@/services/database/profiles'
import {RecordProfileHost} from '@/services/database/types'
import {HostCredentialsPackage} from '../types_ui'


@Component({})
export default class extends Vue {

    @Prop() profile:Profile

    error = null

    async paste(){
        // Paste and parse credentials
        const result = await this.paste_inner()
        if (result){
            this.error = result
        }
    }

    async paste_inner():Promise<string>{
        // Paste credentials, returning either an error string or nothing for success

        // Get text from clipboard
        const clipboard = (await get_clipboard_text()).trim()
        if (!clipboard){
            return "Nothing copied yet"
        }

        // Ensure the syntax is correct
        if (!clipboard.startsWith('stello:')){
            return "The copied text is not valid (should start with \"stello:\")"
        }
        const parts = clipboard.split(':')
        const cloud = parts[1]
        const bucket = parts[2]
        const secret = parts[3]

        // Try to download real credentials using given code
        if (! /^[A-Za-z0-9\-]+$/.test(bucket)){
            return "The copied text is not valid"
        }
        let resp:Response
        try {
            if (cloud === 'aws'){
                resp = await fetch(`https://${bucket}.s3.amazonaws.com/credentials`)
            } else {
                return "Cloud provider not supported"
            }
        } catch {
            return "Unable to retrieve the credentials (check your Internet connection)"
        }
        if (!resp.ok){
            return "Credentials are missing (they may have expired)"
        }

        // Decrypt the response to an object
        let data:HostCredentialsPackage
        try {
            const key = await import_key_sym(url64_to_buffer(secret))
            const decrypted = await decrypt_sym(await resp.arrayBuffer(), key)
            data = JSON.parse(utf8_to_string(decrypted))
        } catch {
            return "Could not decrypt the credentials (did you miss any characters?)"
        }

        // Helper for validating strings
        // SECURITY Threat is more likely to be tricking someone into using a malicious bucket
        //      But this at least prevents random objects/types being stored when should be strings
        const ensure_string = (value, nullable=false) => {
            if (value === null && nullable){
                return null
            } else if (typeof value !== 'string' || !value){
                throw Error("Invalid value")
            }
            return value
        }

        // Extract the data
        // NOTE Use values that have been validated already if possible
        // WARN Don't set values on actual profile until all validated
        let host:RecordProfileHost
        try {
            host = {
                cloud: cloud,
                bucket: bucket,
                region: ensure_string(data.region),
                user: ensure_string(data.user, true),
                credentials: null,
            }
            if (cloud === 'aws'){
                host.credentials = {
                    key_id: ensure_string(data.credentials.key_id),
                    key_secret: ensure_string(data.credentials.key_secret),
                }
            }
        } catch {
            return "There is something wrong with the credentials"
        }

        // All good so save
        this.profile.host = host
        self._db.profiles.set(this.profile)

        // Delete the credentials from the bucket
        const storage = this.profile.new_host_user()
        await storage.delete_file('credentials')

        // Close dialog
        this.dismiss()
    }

    dismiss(){
        // Close the dialog
        this.$emit('close')
    }

}

</script>


<style lang='sass' scoped>

</style>

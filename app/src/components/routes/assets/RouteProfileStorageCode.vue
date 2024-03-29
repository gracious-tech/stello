
<template lang='pug'>

div
    p(class='text-center')
        app-btn(@click='paste') Paste storage code
    p(class='text-center error--text mt-4') {{ error }}

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {get_clipboard_text} from '@/services/utils/misc'
import {decrypt_sym, import_key_sym} from '@/services/utils/crypt'
import {utf8_to_string, url64_to_buffer} from '@/services/utils/coding'
import {Profile} from '@/services/database/profiles'
import {RecordProfileHost} from '@/services/database/types'
import {HostCredentialsPackage} from '@/components/types_ui'
import {report_http_failure, request} from '@/services/utils/http'
import {ensure_string} from '@/services/utils/exceptions'
import {HostStorageGeneratedAws} from '@/services/hosts/aws_common'


@Component({})
export default class extends Vue {

    @Prop({required: true}) declare readonly profile:Profile

    error:string|null = null

    async paste(){
        // Paste and parse credentials
        const result = await this.paste_inner()
        if (result){
            this.error = result
        }
    }

    async paste_inner():Promise<string|null>{
        // Paste credentials, returning either an error string or nothing for success

        // Get text from clipboard
        const clipboard = (await get_clipboard_text() ?? '').trim()
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
        if (!bucket || ! /^[A-Za-z0-9-]+$/.test(bucket)){
            return "The copied text is not valid"
        }
        let encrypted:ArrayBuffer|null
        try {
            if (cloud === 'aws'){
                const url = `https://${bucket}.s3.amazonaws.com/messages/_user/credentials`
                encrypted = await request(url, {}, 'arrayBuffer', 'throw_null403-4')
            } else {
                return "Cloud provider not supported"
            }
        } catch (error){
            report_http_failure(error)
            return "Unable to retrieve the credentials (check your Internet connection)"
        }
        if (!encrypted){
            return "Credentials are missing (they may have expired)"
        }

        // Decrypt the response to an object
        let data:HostCredentialsPackage
        try {
            const key = await import_key_sym(url64_to_buffer(secret ?? ''))
            const decrypted = await decrypt_sym(encrypted, key)
            data = JSON.parse(utf8_to_string(decrypted)) as HostCredentialsPackage
        } catch {
            return "Could not decrypt the credentials (did you miss any characters?)"
        }

        // Curretly only support AWS
        const generated = data.generated as HostStorageGeneratedAws

        // Extract the data
        // NOTE Use values that have been validated already if possible
        // WARN Don't set values on actual profile until all validated
        let host:RecordProfileHost
        try {
            host = {
                cloud: cloud,  // Already verified
                bucket: bucket,  // Already verified
                region: ensure_string(data.region),
                generated: {
                    credentials: {
                        accessKeyId: ensure_string(generated.credentials.accessKeyId),
                        secretAccessKey: ensure_string(generated.credentials.secretAccessKey),
                    },
                    api_id: ensure_string(generated.api_id),
                },
            }
        } catch {
            return "There is something wrong with the credentials"
        }

        // All good so save
        this.profile.host = host
        void self.app_db.profiles.set(this.profile)

        // Delete the credentials from the bucket
        const storage = await self.app_db.new_host_user(this.profile)
        await storage.delete_file('credentials')

        return null
    }
}

</script>


<style lang='sass' scoped>

</style>

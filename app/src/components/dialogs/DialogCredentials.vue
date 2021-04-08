
<template lang='pug'>

v-card
    v-card-title Storage Credentials

    v-card-text
        p(class='error--text') Generating new credentials will delete any old ones, causing loss of access for any accounts currently using them.

        div(class='text-center')
            template(v-if='sharing_key')
                p(class='accent--text') Share below (copied already, expires in {{ sharing_lifespan }} days)
                v-textarea(:value='this.sharing_key' readonly)
            template(v-else-if='waiting')
                v-progress-circular(indeterminate color='accent')
            template(v-else-if='credentials')
                p(class='accent--text') New credentials created
                p
                    app-btn(disabled) Create profile
                    app-btn(@click='upload') Upload and share
            template(v-else)
                app-btn(@click='generate' color='error') Generate new credentials

    v-card-actions
        app-btn(@click='dismiss') Close

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {HostManagerStorage, HostStorageCredentials} from '@/services/hosts/types'
import {HostCredentialsPackage} from '@/components/types_ui'
import {encrypt_sym, generate_key_sym} from '@/services/utils/crypt'
import {string_to_utf8} from '@/services/utils/coding'
import {buffer_to_url64} from '@/services/utils/coding'
import {get_host_user} from '@/services/hosts/hosts'


@Component({})
export default class extends Vue {

    @Prop() storage:HostManagerStorage

    storage_credentials:HostStorageCredentials = null
    waiting = false
    sharing_key = null
    sharing_lifespan = 30

    get credentials_package():HostCredentialsPackage{
        // Return credentials package for passing to a sending profile
        if (!this.storage_credentials)
            return null
        return {
            cloud: this.storage.cloud,
            bucket: this.storage.bucket,
            region: this.storage.region,
            user: null,
            ...this.storage_credentials,
        }
    }

    async generate(){
        // Generate new credentials
        this.waiting = true
        try {
            this.storage_credentials = await this.storage.new_credentials()
        } catch (error){
            // Handle situation where old keys still waiting to be deleted
            if (error.code !== 'LimitExceeded'){
                throw error
            }
            this.$store.dispatch('show_snackbar',
                "Old keys still waiting to be deleted (try again soon)")
        }
        this.waiting = false
    }

    async upload(){
        // Encrypt and upload credentials for downloading by Stello running on another user's device
        this.waiting = true

        // Encrypt the credentials package
        const data = string_to_utf8(JSON.stringify(this.credentials_package))
        const key = await generate_key_sym(true)
        const encrypted = await encrypt_sym(data, key)

        // Upload to the bucket
        const host_user_class = get_host_user(this.storage.cloud)
        const user_storage = new host_user_class(
            // NOTE Use manager credentials since new access keys can take some seconds to work
            this.storage.credentials,
            this.credentials_package.bucket,
            this.credentials_package.region,
            this.credentials_package.user,
        )
        try {
            await user_storage.upload_file('credentials', encrypted, this.sharing_lifespan)
        } catch (error) {
            (this as any).$network_error(error)
            this.waiting = false
            return
        }

        // Display sharing key and copy to clipboard
        const url64_key = buffer_to_url64(await crypto.subtle.exportKey('raw', key))
        this.sharing_key = `stello:${this.storage.cloud}:${this.storage.bucket}:${url64_key}`
        self.navigator.clipboard.writeText(this.sharing_key)

        this.waiting = false
    }

    dismiss(){
        this.$emit('close')
    }
}

</script>


<style lang='sass' scoped>

</style>

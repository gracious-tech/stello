
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

import {HostManagerStorage, HostCredentials} from '@/services/hosts/types'
import {HostCredentialsPackage} from '@/components/types_ui'
import {encrypt_sym, generate_key_sym} from '@/services/utils/crypt'
import {utf8_to_buffer} from '@/services/utils/coding'
import {HostUserAws} from '@/services/hosts/aws_user'
import {buffer_to_url64} from '@/services/utils/coding'


@Component({})
export default class extends Vue {

    @Prop() storage:HostManagerStorage

    credentials:HostCredentials = null
    waiting = false
    sharing_key = null
    sharing_lifespan = 30

    get credentials_package():HostCredentialsPackage{
        // Return credentials package for passing to a sending profile
        if (!this.credentials)
            return null
        return {
            cloud: this.storage.cloud,
            bucket: this.storage.bucket,
            region: this.storage.region,
            user: null,
            ...this.credentials,
        }
    }

    async generate(){
        // Generate new credentials
        this.waiting = true
        try {
            this.credentials = await this.storage.new_credentials()
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
        const data = utf8_to_buffer(JSON.stringify(this.credentials_package))
        const key = await generate_key_sym(true)
        const encrypted = await encrypt_sym(data, key)

        // Upload to the bucket
        // NOTE Use manager credentials since new access keys can take some seconds to work
        // TODO This is AWS specific (need to make generic)
        const user_storage = new HostUserAws({
            credentials: {
                key_id: this.$store.state.manager_aws_key_id,
                key_secret: this.$store.state.manager_aws_key_secret,
            },
            bucket: this.credentials_package.bucket,
            region: this.credentials_package.region,
            user: this.credentials_package.user,
        })
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
        this.$store.dispatch('show_dialog', null)
    }
}

</script>


<style lang='sass' scoped>

</style>

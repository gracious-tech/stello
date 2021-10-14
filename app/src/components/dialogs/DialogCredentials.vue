
<template lang='pug'>

v-card
    v-card-title Credentials for {{ bucket }}

    v-card-text(class='mt-4 text-center')
        template(v-if='sharing_key')
            app-security-alert(class='text-left')
                | You must trust whoever you grant access to this storage,
                | as it will be possible for them to abuse the storage and compute services
                | (but not that of other users).
            p(class='mt-8')
                | Share this storage code
                | (copied already, expires in {{ sharing_lifespan }} days)
            app-textarea(:value='sharing_key' readonly rows=2)
        template(v-else-if='waiting')
            v-progress-circular(indeterminate color='accent')
        template(v-else-if='storage_generated')
            p
                | New credentials created. You can use them yourself or share them
                | and provide storage for another user.
            div
                app-btn(@click='create_profile') Use
                span(class='px-2') |
                app-btn(@click='upload') Share
        template(v-else)
            p(class='error--text text-left')
                | Generating new credentials will delete any old ones,
                | causing loss of access for any accounts currently using them.
            app-btn(@click='generate' color='error') Generate new credentials

    v-card-actions
        app-btn(@click='dismiss') Close

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {HostCredentialsPackage} from '@/components/types_ui'
import {encrypt_sym, generate_key_sym} from '@/services/utils/crypt'
import {string_to_utf8, buffer_to_url64} from '@/services/utils/coding'
import {get_host_user} from '@/services/hosts/hosts'
import {HostManager, HostStorageGenerated} from '@/services/hosts/types'
import {HostStorageGeneratedAws} from '@/services/hosts/aws_common'


@Component({})
export default class extends Vue {

    @Prop({required: true}) manager!:HostManager
    @Prop({type: String, required: true}) bucket!:string
    @Prop({type: String, required: true}) region!:string
    @Prop({type: Boolean, default: false}) autogen!:boolean

    storage_generated:HostStorageGenerated|null = null
    waiting = false
    sharing_key:string|null = null
    sharing_lifespan = 30  // TODO Not enforced until bucket setup with lifecycle rules

    created(){
        // Automatically start generating new storage if set to
        if (this.autogen){
            void this.generate()
        }
    }

    get credentials_package():HostCredentialsPackage|null{
        // Return credentials package for passing to a sending profile
        if (!this.storage_generated)
            return null
        return {
            cloud: this.manager.cloud,
            bucket: this.bucket,
            region: this.region,
            generated: this.storage_generated,
        }
    }

    async generate(){
        // Generate new credentials
        this.waiting = true
        try {
            this.storage_generated = await this.manager.new_storage(this.bucket, this.region)
        } catch (error){
            // Handle situation where old keys still waiting to be deleted
            if ((error as {code:string})?.code !== 'LimitExceeded'){
                throw error
            }
            void this.$store.dispatch('show_snackbar',
                "Old keys still waiting to be deleted (try again soon)")
        }
        this.waiting = false
    }

    async create_profile(){
        // Create a profile with the new credentials
        const profile = await self.app_db.profiles.create()
        profile.host = {
            cloud: this.manager.cloud as 'aws',  // 'gracious' not supported
            region: this.region,
            bucket: this.bucket,
            generated: this.storage_generated as HostStorageGeneratedAws,
        }
        await self.app_db.profiles.set(profile)
        void this.$router.push({name: 'profile', params: {profile_id: profile.id}})
        this.dismiss()
    }

    async upload(){
        // Encrypt and upload credentials for downloading by Stello running on another user's device

        // Encrypt the credentials package
        const data = string_to_utf8(JSON.stringify(this.credentials_package))
        const key = await generate_key_sym(true)
        const encrypted = await encrypt_sym(data, key)

        // Upload to the bucket
        const host_user_class = get_host_user(this.manager.cloud)
        const user_storage = new host_user_class(
            // NOTE Use manager credentials since new access keys can take some seconds to work
            this.credentials_package!.generated as HostStorageGeneratedAws,
            this.credentials_package!.bucket,
            this.credentials_package!.region,
            null,
        )
        this.waiting = true
        try {
            await user_storage.upload_file('credentials', encrypted, this.sharing_lifespan)
        } catch (error) {
            this.$network_error(error)
            return
        } finally {
            this.waiting = false
        }

        // Display sharing key and copy to clipboard
        const url64_key = buffer_to_url64(await crypto.subtle.exportKey('raw', key))
        this.sharing_key = `stello:${this.manager.cloud}:${this.bucket}:${url64_key}`
        void self.navigator.clipboard.writeText(this.sharing_key)
    }

    dismiss(){
        this.$emit('close')
    }
}

</script>


<style lang='sass' scoped>

.v-textarea
    word-break: break-all

</style>

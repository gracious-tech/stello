
<template lang='pug'>

div
    p(class='btns-row')
        app-btn(@click='settings') Settings
        app-btn(@click='scan' :disabled='!key_available') Scan
        app-btn(@click='new_storage' :disabled='!key_available') New
        app-btn(@click='update_all' :disabled='!key_available') Update all

    div.none(v-if='scanning')
        v-progress-circular(indeterminate color='accent')

    v-list(v-else-if='storages.length' dense)
        v-list-item(v-for='storage of storages' :key='storage.bucket')
            v-list-item-title
                | {{ storage.bucket }}
                v-chip(v-if='outdated(storage.version)' small color='error' class='ml-4')
                    | {{ storage.version === undefined ? 'incomplete' : 'outdated' }}
            v-list-item-action
                app-menu-more
                    app-list-item(@click='() => new_credentials(storage)') Get new credentials
                    app-list-item(@click='() => update_services(storage)')
                        | {{ storage.version === undefined ? "Fix" : "Update" }}
                    app-list-item(@click='() => delete_services(storage)' class='error--text')
                        | Delete

    div.none(v-else-if='have_scanned' class='text--secondary')
        p No storage created yet

    div.none(v-else-if='!key_available' class='text--secondary')
        p Enter key to scan or create new storages
        app-btn(@click='settings' small) Enter key

    div.none(v-else class='text--secondary')
        p Haven't scanned yet

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DialogManagerSettings from '@/components/dialogs/DialogManagerSettings.vue'
import DialogStorageCreate from '@/components/dialogs/DialogStorageCreate.vue'
import DialogCredentials from '@/components/dialogs/DialogCredentials.vue'
import {HostCloud, StorageProps} from '@/services/hosts/types'
import {get_host_manager} from '@/services/hosts/hosts'
import {HOST_STORAGE_VERSION} from '@/services/hosts/common'
import DialogGenericConfirm from '@/components/dialogs/generic/DialogGenericConfirm.vue'


@Component({})
export default class extends Vue {

    @Prop({required: true}) declare readonly cloud:HostCloud

    storages:StorageProps[] = []
    scanning = false
    have_scanned = false

    get key_available(){
        // Whether key id and secret have been provided
        return !!this.key_id && !!this.key_secret
    }

    get key_id():string{
        return this.$store.state[`manager_${this.cloud}_key_id`]
    }

    get key_secret():string{
        return this.$store.state.tmp[`manager_${this.cloud}_key_secret`]
    }

    get credentials(){
        if (this.cloud === 'aws'){
            return {
                accessKeyId: this.key_id,
                secretAccessKey: this.key_secret,
            }
        }
        throw new Error('impossible')
    }

    get manager(){
        // Get a new manager instance whenever key changes (since doesn't store state etc)
        const cls = get_host_manager(this.cloud)
        return new cls(this.credentials)
    }

    outdated(version:number|undefined){
        // Whether given version is outdated or not defined
        return version !== HOST_STORAGE_VERSION
    }

    async settings(){
        // Show a dialog for changing manager settings
        void this.$store.dispatch('show_dialog', {
            component: DialogManagerSettings,
            props: {cloud: this.cloud},
        })
    }

    async scan(){
        // Scan for Stello storages in the current account
        this.scanning = true
        try {
            this.storages = await this.manager.list_storages()
            this.have_scanned = true
        } catch (error){
            const aws_auth = ['InvalidClientTokenId', 'SignatureDoesNotMatch']
            if (this.cloud === 'aws' && aws_auth.includes((error as Error).name)){
                void this.$store.dispatch('show_snackbar', "Invalid key")
                return
            }
            this.$network_error(error)
        } finally {
            this.scanning = false
        }
    }

    async new_storage(){
        // Show dialog for choosing a bucket id and create services if accepted
        const resp = (await this.$store.dispatch('show_dialog', {
            component: DialogStorageCreate,
            props: {manager: this.manager},
        })) as {bucket:string, region:string}
        if (resp){
            void this.new_credentials({...resp, version: undefined}, true)
        }
    }

    async new_credentials(storage:StorageProps, autogen=false){
        // Show dialog for generating new credentials
        void this.$store.dispatch('show_dialog', {
            component: DialogCredentials,
            props: {
                manager: this.manager,
                bucket: storage.bucket,
                region: storage.region,
                autogen,
            },
            persistent: true,
        })
    }

    async update_services(storage:StorageProps){
        // Update services for given storage (force update)
        const task = await this.$tm.start('hosts_manager_update',
            [this.cloud, storage.bucket], [storage.region, this.credentials])
        await task.done
        void this.scan()
    }

    async delete_services(storage:StorageProps){
        // Delete services for the given storage

        const confirmed = (await this.$store.dispatch('show_dialog', {
            component: DialogGenericConfirm,
            props: {
                title: `This will permanently delete storage "${storage.bucket}"`,
                confirm: "Delete",
                confirm_danger: true,
            },
        })) as boolean
        if (!confirmed){
            return
        }

        const task = await this.$tm.start('hosts_manager_delete',
            [this.cloud, storage.bucket], [storage.region, this.credentials])
        await task.done
        void this.scan()
    }

    async update_all():Promise<void>{
        // Update all listed storages (only if needed)
        for (const storage of this.storages){
            if (this.outdated(storage.version)){
                const task = await this.$tm.start('hosts_manager_update',
                    [this.cloud, storage.bucket], [storage.region, this.credentials])
                await task.done  // Avoid throttling issues by doing sequentially
            }
        }
        void this.scan()
    }
}

</script>


<style lang='sass' scoped>

@import 'src/styles/utils.sass'


.btns-row
    display: flex
    justify-content: space-around
    margin: 18px 0

.none
    text-align: center
    margin-top: 48px

::v-deep .v-list-item

    &:not(:last-child)
        border-bottom: 1px solid #7773

    .v-btn
        visibility: hidden

    &:hover
        @include themed(background-color, #0001, #fff1)
        .v-btn
            visibility: visible


</style>

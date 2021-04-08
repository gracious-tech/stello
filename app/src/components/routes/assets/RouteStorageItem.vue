
<template lang='pug'>

div
    p(class='btns-row')
        app-btn(@click='set_key') Set Key
        app-btn(@click='scan' :disabled='!key_id') Scan
        app-btn(@click='new_storage' :disabled='!key_id') New
        app-btn(@click='update_all') Update all

    div.none(v-if='scanning')
        v-progress-circular(indeterminate color='accent')

    div.none(v-else-if='!storages.length' class='text--secondary')
        p No storage created yet

    v-list(v-else dense)
        v-list-item(v-for='storage of storages' :key='storage.bucket')
            v-list-item-title
                | {{ storage.bucket }}
                | ({{ storage.version === undefined ? 'incomplete' : `v${storage.version}` }})
            v-list-item-action
                app-menu-more
                    app-list-item(@click='() => new_credentials(storage)'
                        :disabled='storage.version === undefined') Get new credentials
                    app-list-item(@click='() => setup_services(storage)')
                        | {{ storage.version === undefined ? "Fix" : "Update" }}
                    app-list-item(@click='() => delete_services(storage)' color='error') Delete

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DialogManagerKey from '@/components/dialogs/DialogManagerKey.vue'
import DialogStorageCreate from '@/components/dialogs/DialogStorageCreate.vue'
import DialogCredentials from '@/components/dialogs/DialogCredentials.vue'
import {HostCloud, HostManagerStorage} from '@/services/hosts/types'
import {get_host_manager} from '@/services/hosts/hosts'


@Component({})
export default class extends Vue {

    @Prop() cloud:HostCloud

    storages:HostManagerStorage[] = []
    scanning:boolean = false

    async created(){
        // If key set, do an initial scan for storages
        if (this.key_id){
            this.scan()
        }
    }

    get key_id(){
        return this.$store.state[`manager_${this.cloud}_key_id`]
    }

    get key_secret(){
        return this.$store.state[`manager_${this.cloud}_key_secret`]
    }

    get manager(){
        // Get a new manager instance whenever key changes (since doesn't store state etc)
        const cls = get_host_manager(this.cloud)
        return new cls({
            key_id: this.key_id,
            key_secret: this.key_secret,
        })
    }

    async set_key(){
        // Show a dialog for setting the access key
        this.$store.dispatch('show_dialog', {
            component: DialogManagerKey,
            props: {cloud: this.cloud},
        })
    }

    async scan(){
        // Scan for Stello storages in the current account
        this.scanning = true
        this.storages = await this.manager.list_storages()
        this.scanning = false
    }

    async new_storage(){
        // Show dialog for choosing a bucket id and create services if accepted
        const resp = await this.$store.dispatch('show_dialog', {
            component: DialogStorageCreate,
            props: {manager: this.manager},
        })
        if (resp){
            const storage = this.manager.new_storage(resp.bucket, resp.region)
            this.setup_services(storage)
        }
    }

    async new_credentials(storage:HostManagerStorage){
        // Show dialog for generating new credentials
        this.$store.dispatch('show_dialog', {
            component: DialogCredentials,
            props: {storage},
            persistent: true,
        })
    }

    async setup_services(storage:HostManagerStorage){
        // Setup services for given storage (force update)
        const task = await this.$tm.start('hosts_storage_setup',
            [this.cloud, storage.credentials, storage.bucket, storage.region, true])
        await task.done
        this.scan()
    }

    async delete_services(storage:HostManagerStorage){
        // Delete services for the given storage
        // TODO Show a confirmation dialog before deleting for safety
        const task = await this.$tm.start('hosts_storage_delete',
            [this.cloud, storage.credentials, storage.bucket, storage.region])
        await task.done
        this.scan()
    }

    async update_all():Promise<void>{
        // Update all listed storages (only if needed)
        for (const storage of this.storages){
            this.$tm.start('hosts_storage_setup',
                [this.cloud, storage.credentials, storage.bucket, storage.region, false])
        }
    }
}

</script>


<style lang='sass' scoped>

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

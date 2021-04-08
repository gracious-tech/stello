
<template lang='pug'>

div
    p(class='btns-row')
        app-btn(@click='set_key') Set Access Key
        app-btn(@click='scan' :disabled='!key_id') Scan Storage
        app-btn(@click='new_storage' :disabled='!key_id') Create storage

    div.none(v-if='scanning')
        v-progress-circular(indeterminate color='accent')

    div.none(v-else-if='!storages.length' class='text--secondary')
        p No storage created yet

    v-list(v-else dense)
        v-list-item(v-for='storage of storages' :key='storage.bucket')
            v-list-item-title
                | {{ storage.bucket }}
                | (version {{ storage.version || 'incomplete' }})
            v-list-item-action
                app-menu-more
                    app-list-item(@click='() => new_credentials(storage)'
                        :disabled='!storage.version') Get new credentials
                    app-list-item(@click='() => setup_services(storage)')
                        | {{ storage.version ? "Update" : "Fix" }}
                    app-list-item(@click='() => delete_services(storage)' color='error') Delete

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import DialogManagerKey from '@/components/dialogs/DialogManagerKey.vue'
import DialogStorageCreateAws from '@/components/dialogs/DialogStorageCreateAws.vue'
import DialogCredentials from '@/components/dialogs/DialogCredentials.vue'
import {HostManagerAws} from '@/services/hosts/aws_manager'
import {HostManagerStorageAws} from '@/services/hosts/aws_manager'


@Component({})
export default class extends Vue {

    storages:HostManagerStorageAws[] = []
    scanning = false

    async created(){
        // If key set, do an initial scan for storages
        if (this.key_id){
            this.scan()
        }
    }

    get key_id(){
        return this.$store.state.manager_aws_key_id
    }

    get key_secret(){
        return this.$store.state.manager_aws_key_secret
    }

    get manager(){
        // Get a new manager instance whenever key changes (since doesn't store state etc)
        return new HostManagerAws({
            key_id: this.$store.state.manager_aws_key_id,
            key_secret: this.$store.state.manager_aws_key_secret,
        })
    }

    async set_key(){
        // Show a dialog for setting the access key
        this.$store.dispatch('show_dialog', {component: DialogManagerKey, props: {host: 'aws'}})
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
            component: DialogStorageCreateAws,
        })
        if (resp){
            const storage = this.manager.new_storage(resp.bucket, resp.region)
            this.setup_services(storage)
        }
    }

    async new_credentials(storage:HostManagerStorageAws){
        // Show dialog for generating new credentials
        this.$store.dispatch('show_dialog', {
            component: DialogCredentials,
            props: {storage},
            persistent: true,
        })
    }

    async setup_services(storage:HostManagerStorageAws){
        // Setup services for given storage and wrap with task tracking
        const task = await this.$store.dispatch('new_task')
        await task.complete(storage.setup_services(task))
        this.scan()
    }

    async delete_services(storage:HostManagerStorageAws){
        // Delete services for the given storage and wrap with task tracking
        // TODO Show a confirmation dialog before deleting for safety
        const task = await this.$store.dispatch('new_task')
        await task.complete(storage.delete_services(task))
        this.scan()
    }
}

</script>


<style lang='sass' scoped>

.btns-row
    margin: 18px 0
    .v-btn
        margin-right: 18px

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

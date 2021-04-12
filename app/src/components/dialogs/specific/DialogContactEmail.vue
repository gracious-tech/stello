
<template lang='pug'>

v-card
    v-card-title Change email address used

    v-card-text(v-if='error' class='text-center mt-4')
        p A sync is required before changing this contact
        div
            app-btn(@click='resync') Resync

    v-card-text(v-else-if='loading' class='text-center pt-10')
        v-progress-circular(indeterminate color='accent')

    v-card-text(v-else class='mt-4')

        v-list
            v-list-item-group(v-model='chosen' mandatory color='accent')
                v-list-item(v-for='address of addresses' :value='address')
                    v-list-item-icon
                        app-svg(:name='address === chosen ? "icon_radio_checked" : "icon_radio_unchecked"')
                    v-list-item-title {{ address }}
                    v-list-item-action
                        app-btn(@click='() => remove(address)' icon='delete')

        app-text(v-model='new_address' @keyup.enter='add_new' placeholder="New email address...")
            template(#append)
                app-btn(@click='add_new' :disabled='!new_address_valid') Add

    v-card-actions
        app-btn(@click='$emit("close")') Cancel
        app-btn(@click='change' :disabled='!chosen') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Contact} from '@/services/database/contacts'
import {OAuth} from '@/services/database/oauths'
import {taskless_contact_addresses} from '@/services/tasks/contacts'
import {remove_item} from '@/services/utils/arrays'
import {email_address_like} from '@/services/utils/misc'


@Component({})
export default class extends Vue {

    @Prop() contact:Contact
    @Prop() oauth:OAuth

    loading:boolean = true
    error:boolean = false
    addresses:string[] = null
    chosen:string = null
    new_address:string = ''

    async created(){
        // Get addresses currently saved in the contact
        try {
            this.addresses = await taskless_contact_addresses(this.oauth, this.contact.service_id)
        } catch {
            // Whatever the failure is, better to let a sync handle it
            this.error = true
            return
        }
        this.loading = false

        // Rare chance that currently synced address has been deleted, in which case add as option
        if (!this.addresses.includes(this.contact.address)){
            this.addresses.push(this.contact.address)
        }
        this.chosen = this.contact.address
    }

    get new_address_valid():boolean{
        // Whether input in new address field is valid
        const input = this.new_address.trim()
        return !this.addresses.includes(input) && email_address_like(input)
    }

    resync():void{
        // Do a resync and close dialog
        this.$tm.start_contacts_sync(this.oauth.id)
        this.$emit('close')
    }

    remove(address:string):void{
        // Remove an address from the list
        remove_item(this.addresses, address)
        if (this.chosen === address){
            this.chosen = this.addresses[0]
        }
    }

    add_new():void{
        // Add new address to the list
        const input = this.new_address.trim()
        this.addresses.push(input)
        this.chosen = input
        this.new_address = ''
    }

    change():void{
        // Make changes
        this.$tm.start_contacts_change_email(
            this.oauth.id, this.contact.id, this.addresses, this.chosen)
        this.$emit('close')
    }
}

</script>


<style lang='sass' scoped>

::v-deep .v-input__append-inner
    margin-top: 8px

</style>

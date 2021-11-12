
<template lang='pug'>

v-list-item(:to='to')
    v-list-item-action
        app-btn-checkbox(@click.prevent='toggle_selected' :value='item.selected')
    v-list-item-content
        v-list-item-title {{ item.contact.display }}
    v-list-item-action.hello(class='ellipsis ml-4')
        v-list-item-subtitle {{ disengaged ? item.unread : item.contact.name_hello_result }}
    v-list-item-action.address(class='ellipsis ml-4')
        v-list-item-subtitle {{ disengaged ? last_read_str : item.contact.address }}
    v-list-item-action
        app-svg(v-if='issuer' :name='`icon_${issuer}`')

</template>


<script lang='ts'>

import {RawLocation} from 'vue-router'
import {Component, Vue, Prop} from 'vue-property-decorator'

import {Contact} from '@/services/database/contacts'
import {partition} from '@/services/utils/strings'
import {time_between} from '@/services/misc'


interface ContactItem {
    contact:Contact
    selected:boolean
    unread:number
    last_read:Date|null
}


@Component({})
export default class extends Vue {

    @Prop({required: true}) item!:ContactItem
    @Prop({required: true, type: Boolean}) disengaged!:boolean

    get to():RawLocation{
        // Return route location for viewing the contact
        return {
            name: 'contact',
            params: {contact_id: this.item.contact.id},
        }
    }

    get issuer():string|null{
        // Get issuer code if has a service account
        const service_account = this.item.contact.service_account
        return service_account && partition(service_account, ':')[0]
    }

    get last_read_str():string{
        // Get last_read as a time since string
        return this.item.last_read ? time_between(this.item.last_read) : "Nothing opened"
    }

    toggle_selected(event:MouseEvent){
        // Toggle the selected status of the contact item
        this.item.selected = !this.item.selected
    }
}

</script>


<style lang='sass' scoped>

.v-list-item
    // Show selection checkbox on hover of list item
    .v-btn
        visibility: hidden
    &:hover
        .v-btn
            visibility: visible


    > *
        flex-basis: 0  // So grow evenly

    .v-list-item__content, .address
        flex-grow: 4

    .hello
        flex-grow: 2


</style>

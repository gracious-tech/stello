
<template lang='pug'>

v-list-item(:to='to')
    v-list-item-action
        app-btn-checkbox(@click.prevent='toggle_selected' :value='item.selected')
    v-list-item-content
        v-list-item-title {{ item.contact.display }}
    v-list-item-action.hello(class='ellipsis ml-4')
        v-list-item-subtitle {{ item.contact.name_hello_result }}
    v-list-item-action.address(class='ellipsis ml-4')
        v-list-item-subtitle {{ item.contact.address }}
    v-list-item-action(v-if='issuer')
        app-svg(:name='`icon_${issuer}`')

</template>


<script lang='ts'>

import {RawLocation} from 'vue-router'
import {Component, Vue, Prop} from 'vue-property-decorator'

import {Contact} from '@/services/database/contacts'
import {partition} from '@/services/utils/strings'


@Component({})
export default class extends Vue {

    @Prop() item:{contact:Contact, selected:boolean}

    get to():RawLocation{
        // Return route location for viewing the contact
        return {
            name: 'contact',
            params: {contact_id: this.item.contact.id},
        }
    }

    get issuer():string{
        // Get issuer code if has a service account
        const service_account = this.item.contact.service_account
        return service_account && partition(service_account, ':')[0]
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

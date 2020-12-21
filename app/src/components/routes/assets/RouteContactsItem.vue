
<template lang='pug'>

v-list-item(:to='to')
    v-list-item-action
        app-btn-checkbox(@click.prevent='toggle_selected' :value='contact.selected')
    v-list-item-content
        v-list-item-title {{ contact.display }}

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop() contact

    get to(){
        return {name: 'contact', params: {contact_id: this.contact.id}}
    }

    toggle_selected(){
        this.contact.selected = !this.contact.selected
    }

}

</script>


<style lang='sass' scoped>

.v-list-item
    .v-btn
        visibility: hidden
    &:hover
        .v-btn
            visibility: visible

</style>

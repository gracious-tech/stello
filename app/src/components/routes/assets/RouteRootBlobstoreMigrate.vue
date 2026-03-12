
<template lang='pug'>

v-card(v-if='$store.state.show_blobstore_migrate' class='pa-4 text-center')
    v-card-title(class='justify-center') Upgrade database
    v-card-text
        | The latest version of Stello has a better way of saving files that reduces their space
        |  on your computer. It's recommended to upgrade as soon as convenient.
    v-card-actions(class='justify-center')
        app-btn(@click='open_dialog' color='accent' raised) Upgrade now

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import DialogMigrateBlobstore from '@/components/dialogs/specific/DialogMigrateBlobstore.vue'


@Component({})
export default class extends Vue {

    async open_dialog(){
        await this.$store.dispatch('show_dialog', {
            component: DialogMigrateBlobstore,
            persistent: true,
        })
    }

}

</script>


<style lang='sass' scoped>

</style>

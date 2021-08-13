
<template lang='pug'>

div(class='text-center')
    template(v-if='host.cloud')
        h1(class='text-h6 mb-2 accent--text') {{ host.bucket }}
    div.btns(v-else)
        app-btn(@click='show_dialog_new') New storage
        app-btn(@click='show_dialog_existing') Use existing storage


</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DialogHostNew from '@/components/dialogs/specific/DialogHostNew.vue'
import DialogHostExisting from '@/components/dialogs/DialogHostExisting.vue'
import {Profile} from '@/services/database/profiles'


@Component({})
export default class extends Vue {

    @Prop() profile:Profile

    get host(){
        return this.profile.host
    }

    show_dialog_new(event:MouseEvent){
        // Show dialog for creating new storage
        this.$store.dispatch('show_dialog', {
            component: DialogHostNew,
            props: {profile: this.profile},
        })
    }

    show_dialog_existing(event:MouseEvent){
        // If in dev mode, can shift click to add dev account details
        if (import.meta.env.MODE === 'development' && event.shiftKey){
            // NOTE relies on next steps to save to db for simplicity
            this.profile.host = JSON.parse(import.meta.env.VITE_DEV_HOST_SETTINGS)
            return
        }
        this.$store.dispatch('show_dialog', {
            component: DialogHostExisting,
            props: {profile: this.profile},
        })
    }
}

</script>


<style lang='sass' scoped>


.btns
    display: flex
    justify-content: space-around


</style>

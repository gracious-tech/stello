
<template lang='pug'>

div(class='text-center')
    template(v-if='host.cloud')
        h1(class='text-h6 mb-2 accent--text') {{ profile.host.bucket }}
        h2(class='text-subtitle-2') {{ $t(`host_cloud.${host.cloud}`) }}
    template(v-else)
        app-btn(disabled) Create new account
        app-btn(@click='show_dialog_existing') Add existing account

        //- TODO tmp
        v-alert(class='app-bg-accent my-16')
            template(#prepend)
                app-svg(name='icon_info' class='mr-3' style='min-width: 36px')
            | To get free early access to Stello, please email #[a(href='mailto:support@gracious.tech' style='font-weight: bold') support@gracious.tech] with "New account" in subject and we'll create one for you within 24 hours.


</template>


<i18n>
en:
    host_cloud:
        aws: "Amazon Web Services"
</i18n>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DialogHostExisting from '@/components/dialogs/DialogHostExisting.vue'
import {Profile} from '@/services/database/profiles'


@Component({})
export default class extends Vue {

    @Prop() profile:Profile

    get host(){
        return this.profile.host
    }

    show_dialog_existing(event:MouseEvent){
        // If in dev mode, can shift click to add dev account details
        if (process.env.NODE_ENV === 'development' && event.shiftKey){
            // NOTE relies on next steps to save to db for simplicity
            this.profile.host = JSON.parse(process.env.VUE_APP_DEV_HOST_SETTINGS)
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

</style>

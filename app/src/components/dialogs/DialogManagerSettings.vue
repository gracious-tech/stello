
<template lang='pug'>

v-card
    v-card-title Manager Settings

    v-card-text
        ol(class='mb-4')
            li
                app-a(href='https://portal.aws.amazon.com/billing/signup')
                    | Create an account
                |
                | with Amazon Web Services
            li
                app-a(href='https://console.aws.amazon.com/iam/home?#/security_credentials')
                    | Create an access key
            li Delete the access key after creating the storages you require
        app-text(v-model.trim='key_id' label="Access key ID"
            hint="Must have permission to manipulate the services Stello relies on")
        app-password(v-model='key_secret' label="Secret key")

    v-card-actions
        app-btn(@click='dismiss') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {HostCloud} from '@/services/hosts/types'


@Component({})
export default class extends Vue {

    @Prop({required: true}) declare readonly cloud:HostCloud

    get key_id(){
        return this.$store.state[`manager_${this.cloud}_key_id`]
    }
    set key_id(value){
        this.$store.commit('dict_set', [`manager_${this.cloud}_key_id`, value])
    }

    get key_secret(){
        return this.$store.state.tmp[`manager_${this.cloud}_key_secret`]
    }
    set key_secret(value){
        this.$store.commit('tmp_set', [`manager_${this.cloud}_key_secret`, value])
    }

    dismiss(){
        this.$emit('close')
    }
}

</script>


<style lang='sass' scoped>


</style>

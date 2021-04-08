
<template lang='pug'>

v-card
    v-card-title Manager Access Key

    v-card-text
        p Must have permission to manipulate the services Stello relies on
        app-text(v-model.trim='key_id' label="Access key ID")
        app-password(v-model='key_secret' label="Secret key")

    v-card-actions
        app-btn(@click='clear') Clear
        app-btn(@click='dismiss') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {debounce_set} from '@/services/misc'
import {HostCloud} from '@/services/hosts/types'


@Component({})
export default class extends Vue {

    @Prop() cloud:HostCloud

    get id_prop(){
        return `manager_${this.cloud}_key_id`
    }

    get secret_prop(){
        return `manager_${this.cloud}_key_secret`
    }

    get key_id(){
        return this.$store.state[this.id_prop]
    }

    @debounce_set() set key_id(value){
        this.$store.commit('dict_set', [this.id_prop, value])
    }

    get key_secret(){
        return this.$store.state[this.secret_prop]
    }

    @debounce_set() set key_secret(value){
        this.$store.commit('dict_set', [this.secret_prop, value])
    }

    dismiss(){
        this.$emit('close')
    }

    clear(){
        this.key_id = ''
        this.key_secret = ''
        this.dismiss()
    }

}

</script>


<style lang='sass' scoped>


</style>

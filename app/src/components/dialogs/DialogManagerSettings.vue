
<template lang='pug'>

v-card
    v-card-title Manager Settings

    v-card-text
        app-text(v-model.trim='key_id' label="Access key ID"
            hint="Must have permission to manipulate the services Stello relies on")
        app-password(v-model='key_secret' label="Secret key")
        app-select(v-model='max_lifespan' :items='lifespan_options' label="Force message expiry"
            hint="The maximum duration users can set for their messages to expire by")

    v-card-actions
        app-btn(@click='dismiss') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {HostCloud} from '@/services/hosts/types'
import {generate_lifespan_options} from '@/services/misc'


@Component({})
export default class extends Vue {

    @Prop({required: true}) cloud!:HostCloud

    lifespan_options = generate_lifespan_options()

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

    get max_lifespan(){
        return this.$store.state[`manager_${this.cloud}_max_lifespan`]
    }
    set max_lifespan(value){
        this.$store.commit('dict_set', [`manager_${this.cloud}_max_lifespan`, value])
    }

    dismiss(){
        this.$emit('close')
    }
}

</script>


<style lang='sass' scoped>


</style>

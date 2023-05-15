
<template lang='pug'>

v-card
    v-card-title
        | New Contact
        v-spacer
        app-svg(:name='`icon_${oauth.issuer}`' class='mx-4')
        span(class='text-body-2') {{ oauth.display }}

    v-card-text(class='mt-4')

        app-text(v-model='name' label="Full name")
        //- WARN Application logic currently depends on address being trimmed
        app-text(v-model.trim='address' label="Email address" :rules='[email_address_like]')

    v-card-actions
        app-btn(@click='$emit("close")') Cancel
        app-btn(@click='done' :disabled='!valid') Create

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {email_address_like} from '@/services/utils/misc'
import {OAuth} from '@/services/database/oauths'


@Component({})
export default class extends Vue {

    @Prop({required: true}) declare readonly oauth:OAuth

    name = ''
    address = ''

    email_address_like = email_address_like  // Expose to template

    get valid(){
        return !!this.name.trim() && email_address_like(this.address)
    }

    done(){
        this.$emit('close', {name: this.name, address: this.address})
    }
}

</script>


<style lang='sass' scoped>

</style>

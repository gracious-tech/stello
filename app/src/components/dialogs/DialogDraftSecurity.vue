
<template lang='pug'>

v-card
    v-card-title Expiry

    v-card-text
        app-select(v-bind='$t("lifespan")' v-model='lifespan' :items='lifespan_options'
            :placeholder='inherit_lifespan' persistent-placeholder)
        app-integer(v-bind='$t("max_reads")' v-model='max_reads' :min='1' infinity
            :inherit='inherit_max_reads')

    v-card-actions
        app-btn(@click='dismiss') Close

</template>


<script lang='ts'>

const i18n = {
    lifespan: {
        label: "Expire after",
        hint: "The number of days until the message expires",
    },
    max_reads: {
        label: "Lose access after opening",
        hint: "The number of times each recipient can open the message before they lose access",
        suffix: "times",
    },
}


import {Component, Vue, Prop} from 'vue-property-decorator'

import {Draft} from '@/services/database/drafts'
import {Profile} from '@/services/database/profiles'
import {generate_lifespan_options, lifespan_days_to_text} from '@/services/misc'


@Component({
    i18n: {messages: {en: i18n}},
})
export default class extends Vue {

    @Prop({required: true}) declare readonly draft:Draft
    @Prop({required: true}) declare readonly profile:Profile  // Profile must be set before can use this dialog

    get lifespan_options(){
        return generate_lifespan_options(this.profile.max_lifespan)
    }

    get lifespan(){
        return this.draft.options_security.lifespan
    }
    set lifespan(value){
        this.draft.options_security.lifespan = value
        void self.app_db.drafts.set(this.draft)
    }

    get max_reads(){
        return this.draft.options_security.max_reads
    }
    set max_reads(value){
        this.draft.options_security.max_reads = value
        void self.app_db.drafts.set(this.draft)
    }

    get inherit_lifespan(){
        return lifespan_days_to_text(this.profile.msg_options_security.lifespan)
    }

    get inherit_max_reads(){
        return this.profile.msg_options_security.max_reads
    }

    dismiss(){
        this.$emit('close')
    }

}

</script>


<style lang='sass' scoped>

.v-text-field
    margin-top: 24px

</style>

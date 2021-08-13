
<template lang='pug'>

v-card
    v-card-title Expiry

    v-card-text
        app-integer(v-model='lifespan' v-bind='$t("lifespan")' :min='1' :max='365' infinity
            :inherit='inherit_lifespan')
        app-integer(v-model='max_reads' v-bind='$t("max_reads")' :min='1' infinity
            :inherit='inherit_max_reads')

    v-card-actions
        app-btn(@click='dismiss') Close

</template>


<script lang='ts'>

const i18n = {
    lifespan: {
        label: "Expire after",
        hint: "The number of days until the message expires",
        suffix: "days",
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


@Component({
    i18n: {messages: {en: i18n}},
})
export default class extends Vue {

    @Prop() draft:Draft
    @Prop() profile:Profile  // Profile must be set before can use this dialog

    get lifespan(){
        return this.draft.options_security.lifespan
    }
    set lifespan(value){
        this.draft.options_security.lifespan = value
        self._db.drafts.set(this.draft)
    }

    get max_reads(){
        return this.draft.options_security.max_reads
    }
    set max_reads(value){
        this.draft.options_security.max_reads = value
        self._db.drafts.set(this.draft)
    }

    get inherit_lifespan(){
        return this.profile.msg_options_security.lifespan
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

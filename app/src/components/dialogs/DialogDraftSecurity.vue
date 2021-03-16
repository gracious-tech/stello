
<template lang='pug'>

v-card
    v-card-title Security

    v-card-text
        app-integer(v-model='lifespan' v-bind='$t("lifespan")' :min='1' :max='365' infinity
            :inherit='inherit_lifespan')
        app-integer(v-model='max_reads' v-bind='$t("max_reads")' :min='1' infinity
            :inherit='inherit_max_reads')

    v-card-actions
        app-btn(@click='dismiss') Close

</template>


<i18n>
en:
    lifespan:
        label: "Expire after"
        hint: "The number of days until the message expires"
        suffix: "days"
    max_reads:
        label: "Expire after opening"
        hint: "The number of times the message can be opened by a recipient before it expires"
        suffix: "times"
</i18n>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Draft} from '@/services/database/drafts'
import {Profile} from '@/services/database/profiles'


@Component({})
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
        this.$store.dispatch('show_dialog', null)
    }

}

</script>


<style lang='sass' scoped>

</style>

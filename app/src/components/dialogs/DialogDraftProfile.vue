
<template lang='pug'>

v-card
    v-card-title Sender

    v-card-text
        app-select(v-model='profile' :items='profiles_ui' select v-bind='$t("profile")')
        app-text(v-model='sender_name' v-bind='$t("sender_name")' :placeholder='sender_name_inherit')

    v-card-actions
        app-btn(@click='dismiss') Close

</template>


<i18n>
en:
    profile:
        label: "Account"
    sender_name:
        label: "Name"
</i18n>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Draft} from '@/services/database/drafts'
import {Profile} from '@/services/database/profiles'


@Component({})
export default class extends Vue {

    @Prop({type: Draft, required: true}) draft:Draft
    @Prop({type: Array, required: true}) profiles:Profile[]

    get profiles_ui(){
        // Get valid profiles in UI suitable format
        return this.profiles
            .filter(profile => profile.setup_complete)
            .map(profile => ({value: profile.id, text: profile.display}))
    }

    get profile(){
        return this.draft.profile
    }
    set profile(value){
        this.draft.profile = value
        this.save()
    }

    get profile_data(){
        // Get the actual data for the profile id
        return this.profiles.find(p => p.id === this.profile)
    }

    get sender_name(){
        return this.draft.options_identity.sender_name
    }
    set sender_name(value){
        this.draft.options_identity.sender_name = value
        this.save()
    }

    get sender_name_inherit(){
        return this.profile_data?.msg_options_identity.sender_name
    }

    save(){
        self._db.drafts.set(this.draft)
    }

    dismiss(){
        this.$emit('close')
    }

}

</script>


<style lang='sass' scoped>

</style>


<template lang='pug'>

v-card
    v-card-title Identity settings

    v-card-text(v-if='profiles.length')

        app-security-alert Notifications are not encrypted, do not expire, and will likely remain in your recipient's mailboxes forever. So keep any sensitive content within the actual message.

        app-select(v-model='profile' :items='profiles_ui' select v-bind='$t("profile")')
        app-text(v-model='sender_name' v-bind='$t("sender_name")' :placeholder='sender_name_inherit')

    v-card-text(v-else)
        p(class='text-center') You don't have a sending account yet
        p(class='text-center')
            app-btn(@click='create_profile') Setup sending account

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

    @Prop() draft:Draft

    profiles:Profile[] = []
    profile_in_progress:Profile = null

    async created(){
        // Auto assign default if no account selected yet
        if (!this.profile && this.$store.state.default_profile){
            this.profile = this.$store.state.default_profile
        }

        // Get profiles that can be selected (also one in progress for use if none finished yet)
        const profiles = await self._db.profiles.list()
        this.profiles = profiles.filter(p => p.setup_complete)
        this.profile_in_progress = profiles.find(p => !p.setup_complete) ?? null
    }

    get profiles_ui(){
        // Get profiles list in UI suitable format
        return this.profiles.map(profile => {
            return {value: profile.id, text: profile.display}
        })
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

    get invite_tmpl_email(){
        return this.draft.options_identity.invite_tmpl_email
    }
    set invite_tmpl_email(value){
        this.draft.options_identity.invite_tmpl_email = value
        this.save()
    }

    get invite_tmpl_email_inherit(){
        return this.profile_data?.msg_options_identity.invite_tmpl_email
    }

    save(){
        self._db.drafts.set(this.draft)
    }

    async create_profile(){
        // Create a new profile and go to it (or continue one in progress)
        const profile = this.profile_in_progress ?? await self._db.profiles.create()
        this.$router.push({
            name: 'profile',
            params: {profile_id: profile.id},
        })
    }

    dismiss(){
        this.$emit('close')
    }

}

</script>


<style lang='sass' scoped>

</style>

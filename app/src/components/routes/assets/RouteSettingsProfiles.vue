
<template lang='pug'>

div(class='my-6')
    h1(class='text-h6') Sending Accounts
    p(class='body-2 text--secondary') Accounts are what Stello uses to send your messages, securely storing them for recipients to view. You can have multiple accounts, such as a personal account and a ministry account.

    v-list
        route-settings-profiles-item(v-for='profile of profiles' :key='profile.id'
            :profile='profile' @removed='removed')

    p(class='text-center')
        app-btn(@click='create') Create Account

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import RouteSettingsProfilesItem from '@/components/routes/assets/RouteSettingsProfilesItem.vue'
import {remove_match, sort} from '@/services/utils/arrays'
import {Profile} from '@/services/database/profiles'


@Component({
    components: {RouteSettingsProfilesItem},
})
export default class extends Vue {

    profiles:Profile[] = []

    async created(){
        // Get all profiles and generate sorted list of relevant info
        const profiles = await self._db.profiles.list()
        sort(profiles, 'display')
        this.profiles = profiles
    }

    async create(){
        // Create a new profile and go to it
        const profile = await self._db.profiles.create()
        this.profiles.push(profile)
        this.$router.push({
            name: 'profile',
            params: {profile_id: profile.id},
        })
    }

    removed(profile_id:string){
        // Handle profile removal events
        remove_match(this.profiles, profile => profile.id === profile_id)
    }

}

</script>


<style lang='sass' scoped>


.v-list-item
    @include themed(background-color, #ddd !important, #222 !important)


</style>

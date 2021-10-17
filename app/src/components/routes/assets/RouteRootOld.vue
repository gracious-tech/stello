
<template lang='pug'>

v-alert(v-if='need_migrating.length' color='warning' light)
    h2(class='text-center mb-4') Your accounts need upgrading
    p
        | Thanks for taking part in the beta.
        | In preparation for 1.0,
        | you must upgrade to the new style of accounts which are more secure and easier to setup.
        | Your old accounts are now only able to receive replies but not send any more,
        | and will be deleted after 1 Feb 2022.
    h3 Old accounts
    v-list(class='mb-8')
        v-list-item(v-for='profile of need_migrating' :key='profile.id')
            v-list-item-content
                v-list-item-title {{ profile.display }}
            v-list-item-action
                app-btn(v-on:click='convert(profile)' raised small color='') Convert to new account

    div(class='text-center')
        app-btn(@click='show_why = !show_why' color='' outlined)
            | {{ show_why ? "Hide details" : "More details" }}

    div(v-if='show_why')
        h2 What's changing?
        p Accounts setup prior to version 0.9 use an old system and must be upgraded.
        h2 Why do accounts need changing?
        ol
            li
                | The new account system is more secure. While your messages have always been encrypted,
                | the new system also encrypts your settings which includes your email address.
                | Encrypting this metadata protects you in the unlikely event of a data breach,
                | and further hides your identity from third-parties (including us).
            li
                | The new system uses links that will appear more trustworthy to your readers.
                | You can choose for your messages to either use https://*name*.stello.news
                | or https://*name*.message.quest (an unbranded address).
            li
                | The new system is also easier to setup for new users.
                | And rather than get notifications from "AWS" you'll now get them directly from Stello.
        h2(class='mt-4') What will happen to my messages?
        p
            | Your sent messages stored within Stello will remain unchanged, you will not lose them.
        p
            | However, they will get deleted from our servers after 1 Feb 2022,
            | causing your recipients (but not you) to lose access to them.
            | You can resend them to recipients who'd still like to read them after 1 Feb 2022 by
            | copying to a new draft and sending again via a new account.
        p
            | We unfortunately can't allow old accounts to exist for too long
            | as it would be a security risk.
            | Stello's old system was just a trial,
            | where as the new system will be permanent and remain beyond the beta.
        h2(class='mt-4') What do I need to do?
        p
            | You simply need to create a new account to send from. This process is very quick and
            | easy, and your settings from your old accounts can be copied over, saving you time.
        h3(class='my-4') Please let us know if you have any questions...
        app-btn(href='https://gracious.tech/support/stello/' color='' outlined) contact us

</template>


<script lang='ts'>

import {Profile} from '@/services/database/profiles'
import {Component, Vue} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    profiles:Profile[] = []
    show_why = false

    async created(){
        this.profiles = await self.app_db.profiles.list()
    }

    get need_migrating(){
        // @ts-ignore property hack for old accounts only
        return this.profiles.filter(p => p.old_beta && !p.host_state.old_beta_migrated)
    }

    async convert(profile:Profile){
        void this.$store.dispatch('show_waiting', "Creating account...")

        try {
            // Add old_beta_migrated prop so no longer prompt to migrate this profile
            // @ts-ignore property hack for old accounts only
            profile.host_state.old_beta_migrated = true
            void self.app_db.profiles.set(profile)

            // Copy to new profile
            const new_profile = await self.app_db.profiles.copy(profile)

            // Copy unsubscribes
            for (const unsub of await self.app_db.unsubscribes.list_for_profile(profile.id)){
                unsub.profile = new_profile.id
                void self.app_db.unsubscribes.set(unsub)
            }

            // Go to new profile
            void this.$router.push({name: 'profile', params: {profile_id: new_profile.id}})
        } finally {
            void this.$store.dispatch('close_dialog')
        }
    }

}

</script>


<style lang='sass' scoped>


.v-list-item
    background-color: #fff8


</style>

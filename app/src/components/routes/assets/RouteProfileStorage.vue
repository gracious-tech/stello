
<template lang='pug'>

div
    p(class='text--secondary body-2 mb-12')
        | Stello storage is where your encrypted messages and responses live until they expire
        | or are downloaded.
        | Your storage provider cannot directly decrypt them,
        | but you still must trust them as they could compromise your security in other ways.

    div(v-if='profile.host' class='row align-center justify-center mb-1')
        div(class='column')
            h2(class='text-h5') {{ profile.host.cloud === 'aws' && profile.host.bucket }}
            p(class='text-center mt-2 mb-0 text--secondary') Amazon Web Services
        app-svg.correct(name='icon_done' class='app-fg-accent-relative')

    v-expansion-panels(v-else v-model='storage_provider')

        v-expansion-panel
            v-expansion-panel-header(class='primary')
                strong Gracious Tech
                span Recommended for most users
            v-expansion-panel-content
                p
                    | Your messages will be stored with Gracious Tech (Stello's creator).
                    | We provide this service to make Stello easier to setup.
                h2(class='text-subtitle-2') What will this account be used for?
                v-radio-group(v-model='plan' class='ml-3')
                    v-radio(value='christian' label="Christian causes" color='accent')
                    div(v-if='plan === "christian"' class='ml-6')
                        v-checkbox(v-model='christian_jesus' color='accent'
                            label="Jesus is our God and only saviour")
                        v-checkbox(v-model='christian_bible' color='accent'
                            label="The Bible is our ultimate authority on knowing God and his will")
                    v-radio(value='other' label="Other" color='accent')

                h2(class='text-subtitle-2 text--secondary') Why Christian causes?
                p(class='body-2 text--secondary')
                    | Gracious Tech is a Christian organisation and Stello was originally created
                    | to promote Christian causes, so we ourselves fund their use of Stello.
                    | However, other use cases are also currently free too.

        v-expansion-panel
            v-expansion-panel-header(class='app-bg-primary-relative')
                strong Self-hosted
                span Advanced users only
            v-expansion-panel-content
                p
                    | Your messages will be stored in your own cloud services account
                    | (currently Amazon Web Services).
                    | You will need to keep it secure and pay any fees you incur.
                    | Stello is however very cheap to run, so any costs will likely be very minimal.
                app-security-alert
                    | This is only recommended for users familiar with cloud
                    | services.
                    | Stello can easily be compromised if you do not keep your account secure.
                div(class='text-center')
                    app-btn(@click='self_host') Storage manager

        v-expansion-panel
            v-expansion-panel-header(class='app-bg-primary-relative')
                strong Third party
                span Choose if you were given a code
            v-expansion-panel-content
                p
                    | Your messages will be stored with the third party who gave you a Stello
                    | storage code.
                app-security-alert
                    | Your storage provider can easily compromise your security,
                    | so ensure you fully trust them.
                route-profile-storage-code(:profile='profile')

</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import {Profile} from '@/services/database/profiles'
import RouteProfileStorageCode from '@/components/routes/assets/RouteProfileStorageCode.vue'


@Component({
    components: {RouteProfileStorageCode},
})
export default class extends Vue {

    @Prop({required: true}) profile!:Profile

    storage_provider:number|null = null
    plan:'christian'|'other'|null = null
    christian_jesus = false
    christian_bible = false


    get valid_plan(){
        // Return selected plan (only if valid to do so)
        if (this.storage_provider !== 0){
            return null
        }
        if (this.plan === 'other'){
            return 'other'
        } else if (this.plan === 'christian' && this.christian_jesus && this.christian_bible){
            return 'christian'
        }
        return null
    }

    self_host(){
        // Go to storage manager and delete this profile (as storage manager will create new one)
        void self.app_db.profiles.remove(this.profile.id)
        void this.$router.push('/settings/storage/')
    }

    @Watch('valid_plan') watch_valid_plan(){
        this.$emit('plan', this.valid_plan)
    }
}

</script>


<style lang='sass' scoped>

@import 'src/styles/globals.sass'


.correct
    margin-left: 24px
    width: 80px
    height: 80px

.v-input--radio-group
    .v-radio
        margin-bottom: 16px !important
    ::v-deep label
        @include themed(color, #000 !important, #fff !important)

.v-input--checkbox
    margin-top: 0
    margin-bottom: 8px
    ::v-deep .v-messages
        display: none

.v-expansion-panel
    margin-bottom: 24px

    .v-expansion-panel-header
        user-select: none
        color: white  // All shades of primary better with white
        &:not(.v-expansion-panel-header--active)
            border-radius: 4px
        strong
            max-width: 150px
        span
            opacity: 0.8

    .v-expansion-panel-content
        margin-top: 24px

</style>

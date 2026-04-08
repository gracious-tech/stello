
<template lang='pug'>

div
    app-content(class='pa-6')

        RouteRootRecoverBackup

        RequestsSubscribe

        RouteRootAddressRequests

        RouteRootResendRequests

        RouteRootBlobstoreMigrate

        RouteRootCloudbackup

        img.decor(src='@/assets/decor/welcome.svg')

        v-card(v-if='show_features' class='pa-4')
            v-card-title(class='justify-center') New features
            v-list
                v-list-item(v-for='feature of added' :key='feature.title')
                    v-list-item-content
                        v-list-item-title {{ feature.title }}
                        v-list-item-subtitle {{ feature.desc }}
                    v-list-item-icon
                        app-svg(name='icon_check_circle' class='accent--text')
                template(v-if='todo.length')
                    v-divider
                    v-subheader Gathering funding
                    v-list-item(v-for='feature of todo' :key='feature.title')
                        v-list-item-content
                            v-list-item-title {{ feature.title }}
                            v-list-item-subtitle {{ feature.desc }}
                        v-list-item-icon
                            app-svg(name='icon_pending' color='#fa5788')
            div(class='text-center my-6')
                    app-btn(@click='dismiss_features')
                        | Dismiss

        div(class='text-center my-6')
            p(class='text-body-2')
                | Stello is a free open-source app by Gracious Tech,<br>
                |  made possible by our generous supporters.
            app-btn(href='https://gracious.tech/donate' color='#fa5788' raised small)
                | Learn More

        div(class='mt-15 text-body-2 opacity-secondary text-center') Version {{ version }}

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import app_config from '@/app_config.json'
import RouteRootAddressRequests from './assets/RouteRootAddressRequests.vue'
import RouteRootResendRequests from './assets/RouteRootResendRequests.vue'
import RouteRootBlobstoreMigrate from './assets/RouteRootBlobstoreMigrate.vue'
import RouteRootRecoverBackup from './assets/RouteRootRecoverBackup.vue'
import RouteRootCloudbackup from './assets/RouteRootCloudbackup.vue'
import RequestsSubscribe from '@/components/reuseable/RequestsSubscribe.vue'


@Component({
    components: {RouteRootAddressRequests, RouteRootResendRequests, RouteRootBlobstoreMigrate,
        RouteRootRecoverBackup, RouteRootCloudbackup, RequestsSubscribe},
})
export default class extends Vue {

    added = [
        {
            title: "Backup to Google Drive",
            desc: "Optionally store an encrypted backup in your Google Account",
        },
        {
            title: "More reliable transfer and recovery",
            desc: "Issues related to transferring data to new computers have been resolved",
        },
        {
            title: "Merge duplicate contacts",
            desc: "Contacts with the same email address can be automatically merged",
        },
        {
            title: "Better header images",
            desc: "Header images in emails are now higher quality (re-add yours to update it)",
        },
        {
            title: "Reduced storage use",
            desc: "Stello now internally uses for efficient storage to save you disk space",
        },
    ]
    todo = [
    ]

    get version(){
        return app_config.version
    }

    get show_features(){
        // Show if the user hasn't dismissed for this version yet
        return self.app_store.state.dismissed_features !== app_config.version
    }

    dismiss_features(){
        // Persist the current version as dismissed so the card won't show again until next update
        self.app_store.commit('dict_set', ['dismissed_features', app_config.version])
    }

}

</script>


<style lang='sass' scoped>


.v-card
    margin: 48px 0


.decor
    width: 100%
    max-width: 393px
    margin: 48px auto

.v-list-item__subtitle
    white-space: normal

</style>

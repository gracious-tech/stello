
<template lang='pug'>

div
    app-content(class='pa-6')

        RouteRootAddressRequests

        RouteRootResendRequests

        img.decor(src='@/assets/decor/welcome.svg')

        v-card(class='pa-4')
            v-card-title(class='justify-center') New &amp; upcoming features
            v-list
                v-subheader Recently added
                v-list-item(v-for='feature of added' :key='feature.title')
                    v-list-item-content
                        v-list-item-title {{ feature.title }}
                        v-list-item-subtitle {{ feature.desc }}
                    v-list-item-icon
                        app-svg(name='icon_check_circle' class='accent--text')
                v-divider
                v-subheader Gathering funding
                v-list-item(v-for='feature of todo' :key='feature.title')
                    v-list-item-content
                        v-list-item-title {{ feature.title }}
                        v-list-item-subtitle {{ feature.desc }}
                    v-list-item-icon
                        app-svg(name='icon_pending' color='#fa5788')
            v-divider
            div(class='text-center my-6')
                p(class='text-body-2')
                    | Every feature added to Stello is made free for everyone.
                    | Help fund more features that we can all benefit from.
                div(class='my-3')
                    app-btn(href='https://give.gracious.tech' color='#fa5788' raised small)
                        | Funding progress

        div(class='mt-15 text-body-2 opacity-secondary text-center') Version {{ version }}

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import app_config from '@/app_config.json'
import RouteRootAddressRequests from './assets/RouteRootAddressRequests.vue'
import RouteRootResendRequests from './assets/RouteRootResendRequests.vue'


@Component({
    components: {RouteRootAddressRequests, RouteRootResendRequests},
})
export default class extends Vue {

    added = [
        {
            title: "View sent messages",
            desc: "You no longer need to copy a sent message to view it",
        },
    ]
    todo = [
        {
            title: "Reduce issues with sending limits",
            desc: "Additional techniques to reduce the chance of hitting a sending limit",
        },
        {
            title: "Sync with another device",
            desc: "Access Stello from a phone or another computer",
        },
        {
            title: "Encrypted videos",
            desc: "Add videos directly rather than using third-party sites like Youtube",
        },
        {
            title: "Add polls to messages",
            desc: "Get your readers to vote and only you see the results",
        },
        {
            title: "Edit message after sending",
            desc: "Add or fix any part of your message without sending additional emails",
        },
        {
            title: "Dashboard insights",
            desc: "A proper dashboard that gives you the info you need when Stello opens",
        },
    ]

    get version(){
        return app_config.version
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


</style>

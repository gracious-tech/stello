
<template lang='pug'>

div
    app-content(class='pa-6')

        RouteRootAddressRequests

        RouteRootResendRequests

        img.decor(src='@/assets/decor/welcome.svg')

        v-card(class='pa-4')
            v-card-title(class='justify-center') New &amp; upcoming features
            v-list
                v-subheader Now available
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
                        app-svg(name='icon_money' color='#fa5788')
            v-divider
            div(class='text-center my-6')
                p(class='text-body-2')
                    | Good news! You can use Stello for free thanks to generous supporters
                    | who've funded the work so far.
                    | Are you able to help fund more features for others to use too?
                app-btn(href='https://give.gracious.tech' color='#fa5788' raised small)
                    | Funding progress

        div(class='mt-15 text-body-2 opacity-secondary text-center') Version {{ version }}
        div.really(class='mt-3 text-center pb-15 mb-15')
            really-free

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import app_config from '@/app_config.json'
import ReallyFree from '@/components/reuseable/ReallyFree.vue'
import RouteRootAddressRequests from './assets/RouteRootAddressRequests.vue'
import RouteRootResendRequests from './assets/RouteRootResendRequests.vue'


@Component({
    components: {RouteRootAddressRequests, RouteRootResendRequests, ReallyFree},
})
export default class extends Vue {

    added = [
        {
            title: `Customise message color and style`,
            desc: "New options available in sending accounts",
        },
        {
            title: "Add pages to messages",
            desc: "Turn your message into a news site with articles and subpages",
        },
        {
            title: "Create a banner image",
            desc: "Single images can be turned into banners with text overlayed",
        },
    ]
    todo = [
        {
            title: "Sync with another device",
            desc: "Access Stello from a phone or another computer",
        },
        {
            title: "Encrypted videos",
            desc: "Add videos directly rather than using third-party sites like Youtube",
        },
        {
            title: "File attachments",
            desc: "Add encrypted files to your messages for readers to open/download",
        },
        {
            title: "Quick reply to responses",
            desc: "Send replies without leaving the list of responses",
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


<template lang='pug'>

div
    app-content(class='pa-6')

        RequestsSubscribe

        RouteRootAddressRequests

        RouteRootResendRequests

        img.decor(src='@/assets/decor/welcome.svg')

        v-card(class='pa-4')
            v-card-title(class='justify-center') New features
            v-list
                v-subheader Recently added
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
            v-divider
            div(class='text-center my-6')
                p(class='text-body-2')
                    | Every feature added to Stello is made free for everyone.
                    | Help fund more features that we can all benefit from.
                div(class='my-3')
                    app-btn(href='https://gracious.tech/donate' color='#fa5788' raised small)
                        | Donate

        div(class='mt-15 text-body-2 opacity-secondary text-center') Version {{ version }}

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import app_config from '@/app_config.json'
import RouteRootAddressRequests from './assets/RouteRootAddressRequests.vue'
import RouteRootResendRequests from './assets/RouteRootResendRequests.vue'
import RequestsSubscribe from '@/components/reuseable/RequestsSubscribe.vue'


@Component({
    components: {RouteRootAddressRequests, RouteRootResendRequests, RequestsSubscribe},
})
export default class extends Vue {

    added = [
        {
            title: "Stello Files now stored in Documents folder",
            desc: "Your data is now easier to find, backup, and move to a new device",
        },
    ]
    todo = [
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

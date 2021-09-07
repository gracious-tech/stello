
<template lang='pug'>

div
    app-content(class='pa-6')

        RouteRootAddressRequests

        RouteRootResendRequests

        img.decor(src='@/assets/decor/welcome.svg')

        div(class='notes')
            div(class='notes-inner app-bg-accent-relative')
                h1(class='text-h6 mb-0') What's new
                h1(class='text-subtitle-2 opacity-secondary mt-0') Version {{ version }}
                ul
                    li Readers can now unsubscribe
                    li Emails now have a customisable header image
                    li Can now customise the email sent for replies
                p(class='text-body-2') plus many other improvements

        div(class='notes')
            div(class='notes-inner')
                h1(class='text-h6') Still to come
                ul
                    li A more useful dashboard
                    li Reducing the chance of errors when sending
                    li Attach files / polls / graphs / and other media types
                p plus many many more...
                app-btn(href='https://give.gracious.tech' color='#fa5788' raised small) Help fund improvements

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

    get version(){
        return app_config.version
    }

}

</script>


<style lang='sass' scoped>

@import 'src/styles/globals.sass'


.v-card
    margin: 48px 0


.decor
    width: 100%
    max-width: 393px
    margin: 48px auto


.notes
    display: flex
    justify-content: center
    margin: 48px 0

    .notes-inner
        display: inline-flex
        flex-direction: column
        border-radius: 12px
        padding: 24px
        width: auto
        align-items: center
        @include themed(background-color, #0001, #fff1)

        > *
            margin: 12px 0

</style>

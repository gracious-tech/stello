
<template lang='pug'>

div
    app-content(class='pa-6')

        RouteRootAddressRequests

        img.decor(src='_assets/decor_root.svg')

        div(class='notes')
            div(class='notes-inner app-bg-accent-relative')
                h1(class='text-h6 mb-0') What's new
                h1(class='text-subtitle-2 opacity-secondary mt-0') {{ version }}
                ul
                    li Better slideshows
                    li Highlight text
                    li Dynamic content (merge fields)
                        ul
                            li Address contacts by name within messages
                            li Include the date a message will expire in emails
                            li etc
                p(class='text-body-2') plus many little improvements

        div(class='notes')
            div(class='notes-inner')
                h1(class='text-h6') Still to come
                ul
                    li Unsubscribing
                    li Header image for emails
                    li An actually helpful dashboard
                p plus many many more...
                app-btn(href='https://give.gracious.tech' color='#fa5788' raised small) Help us

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import app_config from '@/app_config.json'
import RouteRootAddressRequests from './assets/RouteRootAddressRequests.vue'


@Component({
    components: {RouteRootAddressRequests},
})
export default class extends Vue {

    get version(){
        return app_config.version
    }

}

</script>


<style lang='sass' scoped>


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

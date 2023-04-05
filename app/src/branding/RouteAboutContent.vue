
<template lang='pug'>

div
    p This app is a <app-a href='https://copy.church'>free gift</app-a> from <app-a href='https://gracious.tech'>Gracious Tech</app-a>. We create Christian apps that are:
    ul(class='mb-3')
        li Mission-focused
        li High quality
        li Secure
        li Free
    p As such, this app is completely non-profit with no ads, no tracking, and nothing else that would benefit us. This app is for your benefit alone. You can see this for yourself as <app-a href='https://github.com/gracious-tech/stello'>the code is open source</app-a>.
    p We hope you find it useful.
    p(class='row justify-space-around mt-6')
        app-btn(href='https://stello.news' small)
            | Website
            app-svg(name='icon_open_in_new' class='pl-1')
        app-btn(href='https://stello.news/terms/' small)
            | Terms
            app-svg(name='icon_open_in_new' class='pl-1')
        app-btn(href='https://stello.news/privacy/' small)
            | Privacy
            app-svg(name='icon_open_in_new' class='pl-1')

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'


@Component({})
export default class extends Vue {}

</script>


<style lang='sass' scoped>


</style>

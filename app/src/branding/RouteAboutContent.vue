
<template lang='pug'>

div
    p This app is a free gift from <a href='https://gracious.tech' target='_blank'>Gracious Tech</a>. We create apps that are:
    ul(class='mb-3')
        li Mission-focused
        li High quality
        li Secure
        li Free
    p As such, this app is completely non-profit with no ads, no tracking, and nothing else that would benefit us. This app is for your benefit alone. You can see this for yourself as <a href='https://github.com/gracious-tech/stello' target='_blank'>the code is publicly available</a>.
    p We hope this app helps you to communicate well with the supporters of your ministry.
    p
        app-btn(href='https://stello.news' target='_blank')
            | Website
            app-svg(name='icon_open_in_new' class='pl-1')

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'


@Component({})
export default class extends Vue {}

</script>


<style lang='sass' scoped>


</style>

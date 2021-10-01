
<template lang='pug'>

div
    v-toolbar
        v-toolbar-title About

    app-content(class='pa-6')

        route-about-content

        hr

        p(class='body-2 text--secondary text-center mt-12') Version {{ version }}

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import app_config from '@/app_config.json'
import RouteAboutContent from '@/branding/RouteAboutContent.vue'


@Component({components: {RouteAboutContent}})
export default class extends Vue {

    version = app_config.version

}

</script>


<style lang='sass' scoped>

hr
    margin: 50px 0

</style>

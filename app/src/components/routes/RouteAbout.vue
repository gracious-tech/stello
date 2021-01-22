
<template lang='pug'>

div
    v-toolbar
        v-toolbar-title About

    app-content(class='pa-6')

        route-about-content

        hr

        p(class='body-2 text--secondary') This software is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose and noninfringement. In no event shall the authors or copyright holders be liable for any claim, damages or other liability, whether in an action of contract, tort or otherwise, arising from, out of or in connection with the software or the use or other dealings in the software.

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

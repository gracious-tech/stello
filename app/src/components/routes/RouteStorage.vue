
<template lang='pug'>

div
    v-toolbar
        app-btn(to='../' icon='arrow_back')
        v-toolbar-title Storage Manager

    app-content(class='pa-5')
        p(class='error--text') This is an advanced feature, and mistakes may result in loss of data or security breaches.
        p If you have root access to your storage account then you are able to share your storage with other users. If other users have high security needs, it is recommended they create their own accounts, unless you have a good knowledge of information security yourself.

        v-btn-toggle.host(v-model='cloud' color='accent' mandatory)
            v-btn(value='aws') Amazon Web Services
            v-btn(disabled) Google Cloud

        RouteStorageItem(:cloud='cloud')


</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import RouteStorageItem from '@/components/routes/assets/RouteStorageItem.vue'
import {HostCloud} from '@/services/hosts/types'


@Component({
    components: {RouteStorageItem},
})
export default class extends Vue {

    cloud:HostCloud = 'aws'

}

</script>


<style lang='sass' scoped>

.host
    width: 100%

    button
        flex-grow: 1
        flex-basis: 0

</style>

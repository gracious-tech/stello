
<template lang='pug'>

div
    v-toolbar
        app-btn(to='../' icon='arrow_back')
        v-toolbar-title Storage Manager

    app-content(class='pa-5')
        p(class='error--text')
            | This is an advanced feature,
            | and mistakes may result in loss of data or security breaches.
        p
            | This tool allows you to host your own storage for Stello messages.
            | You can also create storages for sharing with other users
            | who do not have their own cloud account.

        v-btn-toggle.host(v-model='cloud' color='accent' mandatory)
            v-btn(value='aws') Amazon Web Services
            v-btn(disabled)
                //- Might be Google Cloud or Azure in future...

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

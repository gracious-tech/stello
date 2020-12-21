
<template lang='pug'>

div
    v-toolbar(color='primary' dark)
        app-btn(to='../' icon='arrow_back')
        v-toolbar-title Storage Manager

    app-content(class='pa-5')
        p(class='error--text') This is an advanced feature, and mistakes may result in loss of data or security breaches.
        p If you have root access to your storage account then you are able to share your storage with other users. If other users have high security needs, it is recommended they create their own accounts, unless you have a good knowledge of information security yourself.

        v-btn-toggle.host(v-model='host_ui' color='accent' mandatory)
            v-btn(value='route-storage-aws') Amazon Web Services
            v-btn(disabled) Google Cloud

        component(:is='host_ui')


</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import RouteStorageAws from '@/components/routes/assets/RouteStorageAws.vue'


@Component({
    components: {RouteStorageAws},
})
export default class extends Vue {

    host_ui = 'route-storage-aws'

}

</script>


<style lang='sass' scoped>

.host
    width: 100%

    button
        flex-grow: 1
        flex-basis: 0

</style>

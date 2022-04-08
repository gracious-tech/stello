
<template lang='pug'>

div(class='text-center')
    button(@click='$emit("click")' class='btn-text s-primary')
        div.contents
            shared-files-icon(:download='content.download')
            | {{ content.label || "Download" }}

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import SharedFilesIcon from '@/shared/SharedFilesIcon.vue'
import {ContentFiles} from '@/services/database/types'


@Component({
    components: {SharedFilesIcon},
})
export default class extends Vue {

    @Prop({type: Object, required: true}) declare readonly content:ContentFiles

}

</script>


<style lang='sass' scoped>

</style>

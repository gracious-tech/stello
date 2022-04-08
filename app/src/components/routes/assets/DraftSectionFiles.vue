
<template lang='pug'>

div(class='text-center')
    button(@click='$emit("click")' class='btn-text s-primary')
        div.contents
            shared-files-icon(:download='download')
            | {{ label || "Download" }}

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import SharedFilesIcon from '@/shared/SharedFilesIcon.vue'


@Component({
    components: {SharedFilesIcon},
})
export default class extends Vue {

    @Prop({type: String, required: true}) declare readonly label:string
    @Prop({type: Boolean, required: true}) declare readonly download:boolean

}

</script>


<style lang='sass' scoped>

</style>

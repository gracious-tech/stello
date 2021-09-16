<!-- Wrapper for a with better defaults

Auto-sets target, as without links will not open while tasks are running
(due to the nature of beforeunload event)

-->

<template lang='pug'>

a(v-bind='$attrs' v-on='$listeners' :target='target')
    slot

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({type: String, default: '_blank'}) target!:string

}

</script>

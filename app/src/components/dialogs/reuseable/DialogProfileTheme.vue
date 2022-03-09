
<template lang='pug'>

v-card
    v-card-title Message appearance

    v-card-text
        p This will change the appearance of all messages, including those already sent.
        route-profile-theme(:profile='profile')

    v-card-actions
        app-btn(@click='done') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import RouteProfileTheme from '@/components/routes/assets/RouteProfileTheme.vue'
import {Profile} from '@/services/database/profiles'


@Component({
    components: {RouteProfileTheme},
})
export default class extends Vue {

    @Prop({required: true}) declare readonly profile:Profile

    done(){
        this.$emit('close')
    }
}

</script>


<style lang='sass' scoped>

</style>

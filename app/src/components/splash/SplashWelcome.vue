
<template lang='pug'>

app-content(class='pa-3 text-center app-bg-primary')

    app-logo.logo

    app-svg.gt(name='gt_logo' responsive)

    h2
        | A new way to send newsletters<br>that are #[span secure] & #[span interactive]

    p(class='mt-6')
        v-btn(@click='done' light) Continue

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import AppLogo from '@/branding/AppLogo.vue'


@Component({
    components: {AppLogo},
})
export default class extends Vue {

    done():void{
        this.$store.commit('dict_set', ['show_splash_welcome', false])
    }
}

</script>


<style lang='sass' scoped>

.logo
    margin-top: 80px
    width: 300px
    height: 100px

.gt
    max-width: 150px
    margin-top: 24px

h2
    margin: 80px 0
    line-height: 1.5 !important
    font-weight: 300
    font-size: 30px
    span
        font-weight: bold


</style>

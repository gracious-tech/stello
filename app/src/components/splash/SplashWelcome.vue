
<template lang='pug'>

app-content.page(class='pa-3 text-center')

    app-logo.logo

    h2(class='text-h4') Send newsletters
    h3(class='text-h6') specially designed for those in ministry

    v-list(class='text-left')
        v-list-item
            v-list-item-icon
                app-svg(name='icon_next_plan')
            v-list-item-content
                v-list-item-title Simple to use
        v-list-item
            v-list-item-icon
                app-svg(name='icon_lock')
            v-list-item-content
                v-list-item-title Secure and encrypted
        v-list-item
            v-list-item-icon
                app-svg(name='icon_color_lens')
            v-list-item-content
                v-list-item-title Stylish without effort

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

    done(){
        this.$store.commit('dict_set', ['show_splash_welcome', false])
    }
}

</script>


<style lang='sass' scoped>

.page
    background-color: $primary
    color: $on_primary

.logo
    margin-top: 40px
    margin-bottom: 40px
    width: 300px
    height: 100px

h2
    margin-bottom: 10px
    color: $accent_lighter

h3
    margin-bottom: 30px

.v-list
    display: inline-block // So can center whole list
    width: 100%
    max-width: 300px

    .v-list-item
        padding-left: 16px * 2
        padding-right: 0

    .v-list-item__icon svg
        // Override default icon size (applied as inline style)
        width: 32px !important
        height: 32px !important

    .v-list-item__title
        white-space: normal  // Allow wrapping

</style>

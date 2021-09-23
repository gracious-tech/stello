
<template lang='pug'>

app-content(class='pa-6 app-bg-primary')

    h1(class='text-center text-h4 mb-3 mt-12') A balance of
    h2.compare(class='text-h5 mb-6')
        span Security
        app-svg(name='icon_compare_arrows')
        span Convenience

    v-alert(class='body-2 text-left app-bg-accent')
        template(#prepend)
            app-svg(name='icon_info' class='mr-3')
        | This is a beta/preview version. While ready to use, the coming official version will be even more reliable and secure if you prefer to wait for it.

    p(class='body-1 text-left mt-15') Stello is designed to send communication as securely as possible while still remaining easy and enjoyable to use. This is a balance and you must decide if Stello is the right choice for your situation, and use at your own risk.

    div.policies
        div
            h3 Security &amp; Privacy
            ul
                li Data stays with you
                li Messages &amp; replies are encrypted
                li We don't benefit from your use
            div(class='mt-4 mb-8')
                app-btn(href='https://stello.news/privacy/' color='' dark outlined small) Full Privacy Policy

        div
            h3 Terms of use
            ul
                li Use at your own risk
                li Security is not guaranteed
                li Do not misuse
            div(class='mt-4 mb-8')
                app-btn(href='https://stello.news/terms/' color='' dark outlined small) Full Terms of use

    p(class='text-center my-12')
        v-btn(@click='done' light) I agree to both

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    done(){
        this.$store.commit('dict_set', ['show_splash_disclaimer', false])
    }
}


</script>


<style lang='sass' scoped>

h2
    color: var(--accent_lighter)

.compare
    display: flex
    align-items: center
    justify-content: center

    span
        text-align: left
        flex-basis: 200px

        &:first-child
            text-align: right

    svg
        width: 48px
        height: 48px
        margin: 0 24px

.v-alert
    margin-top: 40px
    margin-bottom: 60px

    svg
        min-width: 24px

.policies
    display: flex
    justify-content: space-around
    margin-top: 48px

</style>


<template lang='pug'>

app-content.page(class='pa-6')

    h1(class='text-center text-h4 mb-3 mt-12') A balance of
    h2.compare(class='text-h5 mb-6')
        span Security
        app-svg(name='icon_compare_arrows')
        span Convenience

    p(class='body-1 text-left mt-15') Stello is designed to send communication as securely as possible while still remaining easy and enjoyable to use. This is a balance and you must decide if Stello is the right choice for your situation, and use at your own risk.

    app-btn(href='https://stello.news' color='') More information

    v-card(dark class='mt-15')
        v-card-title In legal terms...
        //- From MIT license (case changed, and first word 'the' -> 'this', otherwise unchanged)
        v-card-text(class='body-2 text-left') This software is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose and noninfringement. In no event shall the authors or copyright holders be liable for any claim, damages or other liability, whether in an action of contract, tort or otherwise, arising from, out of or in connection with the software or the use or other dealings in the software.

    v-alert(class='body-2 text-left')
        template(#prepend)
            app-svg(name='icon_warning' class='mr-3')
        | This is an alpha release. It's less stable than a beta, and is for trying out Stello but shouldn't be relied upon for anything important.
    //- v-alert(class='body-2 text-left app-bg-accent')
    //-     template(#prepend)
    //-         app-svg(name='icon_info' class='mr-3')
    //-     | This is a beta version. It's ready to use but may still have some issues.
    //-     | If you identify any, please let us know.

    p.accept(class='text-center')
        v-checkbox(v-model='accept' label="I understand and accept the terms & conditions" color='accent')

    p(class='text-center')
        v-btn(@click='done' :disabled='!accept' light) Continue

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    accept = false

    done(){
        this.$store.commit('dict_set', ['show_splash_disclaimer', false])
    }
}


</script>


<style lang='sass' scoped>

.page
    background-color: $primary
    color: $on_primary

h2
    color: $accent_lighter

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

.v-card
    background-color: #1e1e1e88

    .v-card__title
        font-size: 16px

.v-alert
    margin-top: 20px
    margin-bottom: 40px
    background-color: $error_darker

    svg
        min-width: 24px

.accept
    display: inline-block  // So can center horizontally

</style>

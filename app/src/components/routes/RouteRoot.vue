
<template lang='pug'>

div
    app-content(class='pa-3')
        img.decor(src='_assets/decor_root.svg')
        div.support
            div.support-inner
                h3(class='text-h6') Still to come
                ul
                    li Unsubscribing
                    li Message themes (background &amp; colors)
                    li An actually helpful dashboard
                p + many many more...
                app-btn(href='https://give.gracious.tech' color='#fa5788' raised small) Help us

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

}

</script>


<style lang='sass' scoped>


.decor
    width: 100%
    max-width: 393px
    margin: 48px auto


.support
    display: flex
    justify-content: center

    .support-inner
        display: inline-flex
        flex-direction: column
        border-radius: 12px
        padding: 24px
        width: auto
        align-items: center
        @include themed(background-color, #0001, #fff1)

        > *
            margin: 12px 0

</style>

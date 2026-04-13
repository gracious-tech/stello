
<template lang='pug'>

Layout
    template(#sidebar-bottom)
        div.legal
            hr
            div
                a(href='/privacy/') Privacy policy
            div
                a(href='/terms/') Terms of use

</template>

<script setup>

import DefaultTheme from 'vitepress/theme'

const {Layout} = DefaultTheme

</script>


<style lang='sass'>

.legal
    font-size: 0.8em
    margin: 0 1.25rem 1.25rem 1.25rem
    opacity: 0.7

    hr
        border-width: 1px 0 0 0
        border-top: 1px solid hsla(0, 0%, 100%, 0.2)

    a
        color: inherit


</style>
